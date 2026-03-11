import React from 'react';
import type { UseTopicModalReturn } from './hooks/useTopicModal';

export type TopicModalProps = UseTopicModalReturn;

export function TopicModal({
  isOpen,
  close,
  newTopicTitle,
  setNewTopicTitle,
  selectedTeamName,
  handleSubmit,
  canSubmit,
}: TopicModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            เพิ่ม Session (Add New Topic)
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            สำหรับทีม: {selectedTeamName}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <label
              htmlFor="topicTitle"
              className="block text-sm font-medium text-[var(--color-text-muted)] mb-1"
            >
              ชื่อเรื่อง (Topic Title)
            </label>
            <input
              type="text"
              id="topicTitle"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
              placeholder="e.g., Network & Connectivity"
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg hover:bg-[var(--color-overlay)]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
