import React from 'react';

type AddCapModalProps = {
  isOpen: boolean;
  capNameInput: string;
  onCapNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export function AddCapModal({
  isOpen,
  capNameInput,
  onCapNameChange,
  onSubmit,
  onClose,
}: AddCapModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
          เพิ่มกลุ่ม (Cap)
        </h3>
        <form onSubmit={onSubmit}>
          <input
            type="text"
            value={capNameInput}
            onChange={(e) => onCapNameChange(e.target.value)}
            placeholder="ชื่อ Cap (เช่น Business Management)"
            className="w-full px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] mb-4"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90"
            >
              สร้าง
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

