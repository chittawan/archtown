import { useState } from 'react';
import type { Team } from '../../../types';

export type SubTopicModalParams = {
  teams: Team[];
  updateTeams: (updater: (state: Team[]) => Team[]) => void;
  setExpandedTopics: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export function useSubTopicModal({
  teams,
  updateTeams,
  setExpandedTopics,
}: SubTopicModalParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [newSubTopicTitle, setNewSubTopicTitle] = useState('');

  const open = (teamId: string, topicId: string) => {
    setSelectedTeamId(teamId);
    setSelectedTopicId(topicId);
    setNewSubTopicTitle('');
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setSelectedTeamId(null);
    setSelectedTopicId(null);
    setNewSubTopicTitle('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTopicTitle.trim() || !selectedTeamId || !selectedTopicId) return;
    updateTeams((prev) =>
      prev.map((team) =>
        team.id === selectedTeamId
          ? {
              ...team,
              topics: team.topics.map((topic) =>
                topic.id === selectedTopicId
                  ? {
                      ...topic,
                      subTopics: [
                        ...topic.subTopics,
                        {
                          id: `sub-${Date.now()}`,
                          title: newSubTopicTitle,
                          status: 'GREEN' as const,
                          details: [],
                        },
                      ],
                    }
                  : topic
              ),
            }
          : team
      )
    );
    setExpandedTopics((prev) => new Set(prev).add(selectedTopicId));
    close();
  };

  const selectedTopicTitle =
    teams
      .find((t) => t.id === selectedTeamId)
      ?.topics.find((top) => top.id === selectedTopicId)?.title ?? '';

  return {
    isOpen,
    open,
    close,
    selectedTeamId,
    selectedTopicId,
    newSubTopicTitle,
    setNewSubTopicTitle,
    selectedTopicTitle,
    handleSubmit,
    canSubmit: !!newSubTopicTitle.trim(),
  };
}

export type UseSubTopicModalReturn = ReturnType<typeof useSubTopicModal>;
