import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import type { EditorParticipant } from '@patchpit/sandbox';
import { caretBounds, textSelectionBounds } from './text-geometry.ts';

export type RemoteSelectionPaint = {
  readonly caret: CSSProperties;
  readonly color: number;
  readonly label: string;
  readonly rectangles: readonly CSSProperties[];
  readonly sessionId: string;
};

export const useRemoteSelectionPaint = (
  editor: RefObject<HTMLDivElement | null>,
  participants: readonly EditorParticipant[],
  text: string,
) => {
  const [paint, setPaint] = useState<readonly RemoteSelectionPaint[]>([]);
  useLayoutEffect(() => {
    const host = editor.current;
    if (host === null) return;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const control = host.getBoundingClientRect();
      const position = (bounds: DOMRect): CSSProperties => ({
        left: bounds.left - control.left - host.clientLeft + host.scrollLeft,
        top: bounds.top - control.top - host.clientTop + host.scrollTop,
        width: bounds.width,
        height: bounds.height,
      });
      setPaint(participants.flatMap((participant): readonly RemoteSelectionPaint[] => {
        const selection = participant.local ? undefined : participant.selection;
        if (selection === undefined
          || selection.anchor > text.length
          || selection.focus > text.length) return [];
        const focus = caretBounds(host, selection.focus);
        if (focus === undefined) return [];
        const start = Math.min(selection.anchor, selection.focus);
        const end = Math.max(selection.anchor, selection.focus);
        return [{
          caret: position(focus),
          color: participant.color,
          label: participant.label,
          rectangles: start === end
            ? []
            : textSelectionBounds(host, start, end).map(position),
          sessionId: participant.sessionId,
        }];
      }));
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(measure);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(host);
    schedule();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [editor, participants, text]);
  return paint;
};
