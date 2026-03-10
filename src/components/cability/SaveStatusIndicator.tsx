import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Save } from 'lucide-react';

export type SaveStatus = 'idle' | 'saving' | 'ok' | 'error';

export interface SaveStatusIndicatorRef {
  setSaveStatus: (status: SaveStatus) => void;
}

interface SaveStatusIndicatorProps {
  onSettled?: () => void;
}

export const SaveStatusIndicator = forwardRef<SaveStatusIndicatorRef, SaveStatusIndicatorProps>(
  function SaveStatusIndicator({ onSettled }, ref) {
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const onSettledRef = useRef(onSettled);
    onSettledRef.current = onSettled;

    useImperativeHandle(ref, () => ({
      setSaveStatus,
    }), []);

    useEffect(() => {
      if (saveStatus !== 'ok' && saveStatus !== 'error') return;
      onSettledRef.current?.();
    }, [saveStatus]);

    if (saveStatus === 'idle' || saveStatus === 'error') return null;
    if (saveStatus === 'saving') {
      return (
        <span className="text-sm text-[var(--color-text-muted)]">กำลังบันทึก...</span>
      );
    }
    return (
      <span className="text-sm text-[var(--color-primary)] flex items-center gap-1">
        <Save className="w-4 h-4" /> บันทึกแล้ว
      </span>
    );
  }
);
