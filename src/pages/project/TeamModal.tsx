import React from 'react';
import type { UseTeamModalReturn } from './hooks/useTeamModal';

export type TeamModalProps = UseTeamModalReturn;

export function TeamModal({
  isOpen,
  close,
  editingTeamId,
  newTeamName,
  setNewTeamName,
  selectedOrgTeamId,
  handleOrgSelectChange,
  orgTeamsForSelect,
  loadingOrgTeams,
  handleSubmit,
  canSubmit,
  allTeamsAdded,
}: TeamModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[var(--color-modal-backdrop)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md overflow-hidden border border-[var(--color-border)]">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            {editingTeamId ? 'แก้ไขชื่อทีม' : 'เพิ่มทีม (Add Team)'}
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {editingTeamId
              ? 'เลือกจาก data/teams หรือพิมพ์ชื่อที่ต้องการ'
              : 'เลือกจาก data/teams หรือสร้างทีมใหม่'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
              เลือกจากทีมที่มี (data/teams)
            </label>
            {loadingOrgTeams ? (
              <div className="py-3 text-sm text-[var(--color-text-muted)]">
                กำลังโหลดรายการทีม...
              </div>
            ) : (
              <select
                value={selectedOrgTeamId ?? ''}
                onChange={(e) =>
                  handleOrgSelectChange(e.target.value || null)
                }
                className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">-- เลือกทีม --</option>
                {orgTeamsForSelect.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.id})
                  </option>
                ))}
                {!editingTeamId && allTeamsAdded && (
                  <option value="" disabled>
                    ทุกทีมถูกเพิ่มแล้ว
                  </option>
                )}
              </select>
            )}
          </div>
          <div className="relative">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-full border-t border-[var(--color-border)]" />
            <span className="relative block text-center">
              <span className="bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-muted)]">
                หรือสร้างทีมใหม่
              </span>
            </span>
          </div>
          <div>
            <label
              htmlFor="teamName"
              className="block text-sm font-medium text-[var(--color-text-muted)] mb-1"
            >
              {editingTeamId ? 'หรือชื่อที่แสดง' : 'ชื่อทีมใหม่'}
            </label>
            <input
              type="text"
              id="teamName"
              value={newTeamName}
              onChange={(e) => {
                setNewTeamName(e.target.value);
                if (e.target.value.trim()) handleOrgSelectChange(null);
              }}
              className="w-full px-3 py-2 border border-[var(--color-border-strong)] rounded-lg bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
              placeholder="e.g., Infra, Platform Core"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
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
              {editingTeamId ? 'บันทึก' : 'เพิ่มทีม'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
