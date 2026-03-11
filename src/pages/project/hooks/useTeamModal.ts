import { useState, useEffect } from 'react';
import type { Team } from '../../../types';
import { nameToId, ensureUniqueId } from '../../../lib/idUtils';

export type TeamModalParams = {
  teams: Team[];
  updateTeamName: (teamId: string, name: string) => void;
  updateTeams: (updater: (state: Team[]) => Team[]) => void;
};

export type OrgTeamOption = { id: string; name: string };

export function useTeamModal({
  teams,
  updateTeamName,
  updateTeams,
}: TeamModalParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedOrgTeamId, setSelectedOrgTeamId] = useState<string | null>(null);
  const [orgTeamsForSelect, setOrgTeamsForSelect] = useState<OrgTeamOption[]>([]);
  const [loadingOrgTeams, setLoadingOrgTeams] = useState(false);

  useEffect(() => {
    if (!isOpen && !editingTeamId) return;
    setLoadingOrgTeams(true);
    if (!editingTeamId) {
      setSelectedOrgTeamId(null);
      setNewTeamName('');
    }
    fetch('/api/teams')
      .then((res) => (res.ok ? res.json() : { ids: [] }))
      .then((data: { ids?: string[] }) => {
        const ids = Array.isArray(data.ids) ? data.ids : [];
        return Promise.all(
          ids.map((id: string) =>
            fetch(`/api/teams/${encodeURIComponent(id)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then(
                (raw: {
                  id?: string;
                  data?: { name: string };
                  markdown?: string;
                } | null) =>
                  raw != null && raw.data != null
                    ? { id: raw.id ?? id, name: raw.data.name }
                    : null
              )
          )
        );
      })
      .then((list) =>
        setOrgTeamsForSelect(list.filter(Boolean) as OrgTeamOption[])
      )
      .catch(() => setOrgTeamsForSelect([]))
      .finally(() => setLoadingOrgTeams(false));
  }, [isOpen, editingTeamId]);

  useEffect(() => {
    if (!editingTeamId || orgTeamsForSelect.length === 0) return;
    const team = teams.find((t) => t.id === editingTeamId);
    if (!team) return;
    const org = orgTeamsForSelect.find((o) => o.name === team.name);
    setSelectedOrgTeamId(org?.id ?? null);
  }, [editingTeamId, orgTeamsForSelect, teams]);

  const open = () => {
    setEditingTeamId(null);
    setIsOpen(true);
  };

  const openForEdit = (teamId: string, teamName: string) => {
    setEditingTeamId(teamId);
    setNewTeamName(teamName);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setEditingTeamId(null);
    setSelectedOrgTeamId(null);
    setNewTeamName('');
  };

  const handleOrgSelectChange = (value: string | null) => {
    setSelectedOrgTeamId(value);
    if (value) {
      const org = orgTeamsForSelect.find((o) => o.id === value);
      if (org) setNewTeamName(org.name);
      else if (!editingTeamId) setNewTeamName('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTeamId) {
      const name = selectedOrgTeamId
        ? (orgTeamsForSelect.find((o) => o.id === selectedOrgTeamId)?.name ??
          newTeamName.trim())
        : newTeamName.trim();
      if (name.trim()) {
        updateTeamName(editingTeamId, name.trim());
      }
      close();
      return;
    }
    const projectTeamIds = new Set(teams.map((t) => t.id));
    if (selectedOrgTeamId) {
      const org = orgTeamsForSelect.find((o) => o.id === selectedOrgTeamId);
      if (org) {
        let id = org.id;
        if (projectTeamIds.has(id)) id = `${id}-${Date.now()}`;
        updateTeams((prev) => [...prev, { id, name: org.name, topics: [] }]);
      }
      setSelectedOrgTeamId(null);
    } else if (newTeamName.trim()) {
      const name = newTeamName.trim();
      const existingOrgIds = orgTeamsForSelect.map((o) => o.id);
      const id = ensureUniqueId(nameToId(name) || 'team', existingOrgIds);
      const orgTeam = {
        id,
        name,
        owner: '',
        parentId: null as string | null,
        childIds: [] as string[],
      };
      const res = await fetch('/api/teams/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data: orgTeam }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setOrgTeamsForSelect((prev) => [...prev, { id, name }]);
      }
      updateTeams((prev) => [...prev, { id, name, topics: [] }]);
      setNewTeamName('');
    } else return;
    close();
  };

  const canSubmit = !!(selectedOrgTeamId || newTeamName.trim());
  const allTeamsAdded =
    orgTeamsForSelect.length > 0 &&
    orgTeamsForSelect.every((o) => teams.some((t) => t.id === o.id));
  const availableOrgTeams = editingTeamId
    ? orgTeamsForSelect
    : orgTeamsForSelect.filter((o) => !teams.some((t) => t.id === o.id));

  return {
    isOpen,
    open,
    openForEdit,
    close,
    editingTeamId,
    newTeamName,
    setNewTeamName,
    selectedOrgTeamId,
    setSelectedOrgTeamId,
    handleOrgSelectChange,
    orgTeamsForSelect: availableOrgTeams,
    loadingOrgTeams,
    handleSubmit,
    canSubmit,
    allTeamsAdded,
  };
}

export type UseTeamModalReturn = ReturnType<typeof useTeamModal>;
