import React from 'react';
import { FolderKanban, Search, ChevronDown } from 'lucide-react';
import { nameToId, sanitizeId } from '../../lib/idUtils';
import type { ProjectSummary } from '../../types';

type AddProjectModalProps = {
  capId: string | null;
  addProjectMode: 'select' | 'new';
  setAddProjectMode: (mode: 'select' | 'new') => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  newProjectName: string;
  setNewProjectName: (value: string) => void;
  projectListLoading: boolean;
  filteredProjectList: ProjectSummary[];
  projectSearchQuery: string;
  setProjectSearchQuery: (value: string) => void;
  projectSelectOpen: boolean;
  setProjectSelectOpen: (open: boolean) => void;
  selectedProjectLabel: string;
  addProjectError: string | null;
  onClearAddProjectError?: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export function AddProjectModal({
  capId,
  addProjectMode,
  setAddProjectMode,
  selectedProjectId,
  setSelectedProjectId,
  newProjectName,
  setNewProjectName,
  projectListLoading,
  filteredProjectList,
  projectSearchQuery,
  setProjectSearchQuery,
  projectSelectOpen,
  setProjectSelectOpen,
  selectedProjectLabel,
  addProjectError,
  onClearAddProjectError,
  onSubmit,
  onClose,
}: AddProjectModalProps) {
  if (!capId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-modal-backdrop)]"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <FolderKanban className="w-5 h-5" />
          เพิ่มโปรเจกต์ในกลุ่มนี้
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">
          เลือกโปรเจกต์ที่มีอยู่ หรือสร้างชื่อใหม่
        </p>
        <form onSubmit={onSubmit}>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setAddProjectMode('select')}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                addProjectMode === 'select'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]'
              }`}
            >
              เลือกจากรายการ
            </button>
            <button
              type="button"
              onClick={() => setAddProjectMode('new')}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                addProjectMode === 'new'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-overlay)]'
              }`}
            >
              สร้างใหม่
            </button>
          </div>
          {addProjectMode === 'select' ? (
            <div className="mb-4 relative">
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                เลือกโปรเจกต์
              </label>
              <input
                type="hidden"
                name="selectedProjectId"
                value={selectedProjectId ?? ''}
                required
              />
              <div
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-transparent"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setProjectSelectOpen(false);
                  }
                }}
              >
                <div className="flex items-center gap-2 px-4 py-2 min-h-[42px]">
                  <Search className="w-4 h-4 shrink-0 text-[var(--color-text-subtle)]" />
                  <input
                    type="text"
                    value={projectSelectOpen ? projectSearchQuery : selectedProjectLabel}
                    onChange={(e) => {
                      setProjectSearchQuery(e.target.value);
                      setProjectSelectOpen(true);
                      if (!e.target.value) setSelectedProjectId(null);
                    }}
                    onFocus={() => setProjectSelectOpen(true)}
                    placeholder="— เลือกโปรเจกต์ — พิมพ์เพื่อค้นหา..."
                    className="flex-1 min-w-0 bg-transparent text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none text-sm"
                    aria-invalid={!selectedProjectId}
                    aria-describedby="project-list"
                  />
                  <button
                    type="button"
                    onClick={() => setProjectSelectOpen((o) => !o)}
                    className="shrink-0 p-1 rounded-md text-[var(--color-text-subtle)] hover:bg-[var(--color-overlay)]"
                    aria-label={projectSelectOpen ? 'ปิดรายการ' : 'เปิดรายการ'}
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        projectSelectOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
                {projectSelectOpen && (
                  <ul
                    id="project-list"
                    className="max-h-48 overflow-y-auto border-t border-[var(--color-border)] py-1"
                    role="listbox"
                  >
                    {projectListLoading ? (
                      <li className="px-4 py-2 text-sm text-[var(--color-text-muted)]">
                        กำลังโหลด...
                      </li>
                    ) : filteredProjectList.length === 0 ? (
                      <li className="px-4 py-2 text-sm text-[var(--color-text-muted)]">
                        ไม่พบโปรเจกต์
                      </li>
                    ) : (
                      filteredProjectList.map((p) => {
                        const label = `${p.name}${
                          p.summaryStatus ? ` (${p.summaryStatus})` : ''
                        }`;
                        return (
                          <li
                            key={p.id}
                            role="option"
                            aria-selected={selectedProjectId === p.id}
                            className={`px-4 py-2 text-sm cursor-pointer hover:bg-[var(--color-overlay)] ${
                              selectedProjectId === p.id
                                ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                                : 'text-[var(--color-text)]'
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedProjectId(p.id);
                              setProjectSearchQuery('');
                              setProjectSelectOpen(false);
                            }}
                          >
                            {label}
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <>
              {addProjectError && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
                  {addProjectError}
                </p>
              )}
              <div className="mb-4 space-y-3">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                  ชื่อโปรเจกต์
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => {
                    setNewProjectName(e.target.value);
                    onClearAddProjectError?.();
                  }}
                  placeholder="เช่น Performance Management"
                  className="w-full px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">
                  Project ID (ใช้เป็นชื่อไฟล์ใน data/projects)
                </label>
                <input
                  type="text"
                  readOnly
                  value={
                    newProjectName.trim()
                      ? sanitizeId(nameToId(newProjectName.trim())) || 'project'
                      : '—'
                  }
                  className="w-full px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-overlay)] text-[var(--color-text-subtle)] cursor-default"
                  aria-readonly="true"
                />
              </div>
            </div>
            </>
          )}
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
              disabled={
                addProjectMode === 'select' ? !selectedProjectId : !newProjectName.trim()
              }
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
            >
              เพิ่ม
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

