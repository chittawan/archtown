import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Status, Topic, SubTopicType, TodoItemStatus } from '../../types';
import { SortableSubTopicCard } from './SortableSubTopicCard';

type EditingSubTopicState = {
  teamId: string;
  topicId: string;
  subTopicId: string;
} | null;

type SubtopicDroppableAreaProps = {
  teamId: string;
  topic: Topic;
  isExpanded: boolean;
  updateSubTopicStatus: (topicId: string, subTopicId: string, s: Status) => void;
  deleteSubTopic: (topicId: string, subTopicId: string) => void;
  editingSubTopic: EditingSubTopicState;
  editSubTopicTitle: string;
  onEditSubTopicTitleChange: (v: string) => void;
  onStartEditSubTopicTitle: (topicId: string, subTopicId: string) => void;
  onSaveEditSubTopicTitle: (finalTitle?: string) => void;
  onCancelEditSubTopicTitle: () => void;
  onAddDetail: (topicId: string, subTopicId: string) => void;
  onUpdateDetail: (topicId: string, subTopicId: string, index: number, value: string) => void;
  onUpdateDetailDueDate: (
    topicId: string,
    subTopicId: string,
    index: number,
    dueDate: string | undefined
  ) => void;
  onUpdateDetailStatus: (topicId: string, subTopicId: string, index: number, status: TodoItemStatus) => void;
  onRemoveDetail: (topicId: string, subTopicId: string, index: number) => void;
  onToggleDetailDone: (topicId: string, subTopicId: string, index: number) => void;
  onSubTopicTypeChange: (topicId: string, subTopicId: string, type: SubTopicType) => void;
  openTodoSectionIds: Set<string>;
  onTodoSectionToggle: (subTopicId: string) => void;
};

export function SubtopicDroppableArea({
  teamId,
  topic,
  isExpanded,
  updateSubTopicStatus,
  deleteSubTopic,
  editingSubTopic,
  editSubTopicTitle,
  onEditSubTopicTitleChange,
  onStartEditSubTopicTitle,
  onSaveEditSubTopicTitle,
  onCancelEditSubTopicTitle,
  onAddDetail,
  onUpdateDetail,
  onUpdateDetailDueDate,
  onUpdateDetailStatus,
  onRemoveDetail,
  onToggleDetailDone,
  onSubTopicTypeChange,
  openTodoSectionIds,
  onTodoSectionToggle,
}: SubtopicDroppableAreaProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `subtopic-list-${teamId}-${topic.id}`,
  });

  if (!isExpanded) return null;

  return (
    <div
      ref={setNodeRef}
      className={`border-t border-[var(--color-border)] px-6 py-3 transition-colors ${isOver ? 'bg-[var(--color-primary-muted)]/50' : 'bg-[var(--color-overlay)]'}`}
    >
      {topic.subTopics.length === 0 ? (
        <div className="pl-10 py-3 text-sm text-[var(--color-text-muted)] italic min-h-[44px]">
          ยังไม่มีหัวข้อย่อย — ลากหัวข้อย่อยจากหัวข้ออื่นมาวางที่นี่ได้
        </div>
      ) : (
        <SortableContext
          items={topic.subTopics.map((s) => `sub__${topic.id}__${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 pl-10">
            {topic.subTopics.map((subTopic) => (
              <SortableSubTopicCard
                key={subTopic.id}
                teamId={teamId}
                topicId={topic.id}
                subTopic={subTopic}
                subTopicType={subTopic.subTopicType ?? 'todos'}
                onSubTopicTypeChange={(t) => onSubTopicTypeChange(topic.id, subTopic.id, t)}
                isTodoSectionOpen={openTodoSectionIds.has(subTopic.id)}
                onTodoSectionToggle={() => onTodoSectionToggle(subTopic.id)}
                onUpdateStatus={(status) =>
                  updateSubTopicStatus(topic.id, subTopic.id, status)
                }
                onDelete={() => deleteSubTopic(topic.id, subTopic.id)}
                isEditingTitle={
                  editingSubTopic?.teamId === teamId &&
                  editingSubTopic?.topicId === topic.id &&
                  editingSubTopic?.subTopicId === subTopic.id
                }
                editTitleValue={editSubTopicTitle}
                onEditTitleChange={onEditSubTopicTitleChange}
                onStartEditTitle={() =>
                  onStartEditSubTopicTitle(topic.id, subTopic.id)
                }
                onSaveEditTitle={onSaveEditSubTopicTitle}
                onCancelEditTitle={onCancelEditSubTopicTitle}
                onAddDetail={() => onAddDetail(topic.id, subTopic.id)}
                onUpdateDetail={(index, value) =>
                  onUpdateDetail(topic.id, subTopic.id, index, value)
                }
                onUpdateDetailDueDate={(index, dueDate) =>
                  onUpdateDetailDueDate(topic.id, subTopic.id, index, dueDate)
                }
                onUpdateDetailStatus={(index, status) =>
                  onUpdateDetailStatus(topic.id, subTopic.id, index, status)
                }
                onRemoveDetail={(index) =>
                  onRemoveDetail(topic.id, subTopic.id, index)
                }
                onToggleDetailDone={(index) =>
                  onToggleDetailDone(topic.id, subTopic.id, index)
                }
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

