import { useState } from 'react';
import type { Team } from '../../../types';

export type TopicModalParams = {
  teams: Team[];
  updateTeams: (updater: (state: Team[]) => Team[]) => void;
};

export function useTopicModal({ teams, updateTeams }: TopicModalParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  const open = (teamId: string) => {
    setSelectedTeamId(teamId);
    setNewTopicTitle('');
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setSelectedTeamId(null);
    setNewTopicTitle('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !selectedTeamId) return;
    updateTeams((prev) =>
      prev.map((team) =>
        team.id === selectedTeamId
          ? {
              ...team,
              topics: [
                ...team.topics,
                {
                  id: `top-${Date.now()}`,
                  title: newTopicTitle,
                  subTopics: [],
                },
              ],
            }
          : team
      )
    );
    close();
  };

  const selectedTeamName = teams.find((t) => t.id === selectedTeamId)?.name ?? '';

  return {
    isOpen,
    open,
    close,
    selectedTeamId,
    newTopicTitle,
    setNewTopicTitle,
    selectedTeamName,
    handleSubmit,
    canSubmit: !!newTopicTitle.trim(),
  };
}

export type UseTopicModalReturn = ReturnType<typeof useTopicModal>;
