import React from 'react';
import { AppLanguage, Card as CardType } from '../../types';
import {
  MoreVertical,
  RefreshCw,
  Trash2,
  Settings,
  AlertCircle,
  Clock3,
  CircleAlert,
  AlertTriangle,
  History,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from './Button';
import { t } from '../../i18n';

interface CardShellProps {
  card: CardType;
  children: React.ReactNode;
  isEditMode: boolean;
  isSelected?: boolean;
  failedMoveSignal?: number;
  onSelect?: () => void;
  onRefresh?: () => void;
  onEdit?: () => void;
  onHistory?: () => void;
}

const formatTime = (value: number | undefined, language: AppLanguage, neverText: string) => {
  if (!value) return neverText;
  return new Date(value).toLocaleString(language);
};

export const CardShell: React.FC<CardShellProps> = ({
  card,
  children,
  isEditMode,
  isSelected,
  failedMoveSignal,
  onSelect,
  onRefresh,
  onEdit,
  onHistory,
}) => {
  const { softDeleteCard, language, theme } = useStore();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const previousRectRef = React.useRef<DOMRect | null>(null);
  const moveAnimationRef = React.useRef<Animation | null>(null);
  const failedMoveAnimationRef = React.useRef<Animation | null>(null);
  const tr = (key: string) => t(language, key);

  const width = card.ui_config.size.startsWith('2') ? 2 : 1;
  const height = card.ui_config.size.endsWith('2') ? 2 : 1;

  const getBorderClass = (theme: string) => {
    switch (theme) {
      case 'blue':
        return 'border-t-4 border-t-blue-500';
      case 'green':
        return 'border-t-4 border-t-emerald-500';
      case 'red':
        return 'border-t-4 border-t-rose-500';
      case 'purple':
        return 'border-t-4 border-t-violet-500';
      case 'yellow':
        return 'border-t-4 border-t-amber-500';
      default:
        return 'border-t-4 border-t-border';
    }
  };

  const isLoading = card.runtimeData?.isLoading;
  const isError = card.runtimeData?.state === 'error';
  const thresholdAlertTriggered = Boolean(card.runtimeData?.thresholdAlertTriggered);
  const selectedInvertedClass =
    isEditMode && isSelected
      ? theme === 'dark'
        ? 'bg-white text-slate-900 border-slate-200'
        : 'bg-slate-100 text-slate-900 border-slate-300'
      : '';

  React.useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;

    const currentRect = node.getBoundingClientRect();
    const previousRect = previousRectRef.current;
    previousRectRef.current = currentRect;

    if (!previousRect) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const deltaX = previousRect.left - currentRect.left;
    const deltaY = previousRect.top - currentRect.top;
    if (!deltaX && !deltaY) return;

    const distance = Math.hypot(deltaX, deltaY);
    const duration = Math.min(520, Math.max(320, 200 + distance * 0.7));
    const overshootFactor = 0.06;

    moveAnimationRef.current?.cancel();
    moveAnimationRef.current = node.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        {
          transform: `translate(${-deltaX * overshootFactor}px, ${-deltaY * overshootFactor}px)`,
          offset: 0.84,
        },
        { transform: 'translate(0px, 0px)' },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)',
      },
    );
  }, [card.ui_config.x, card.ui_config.y]);

  React.useEffect(
    () => () => {
      moveAnimationRef.current?.cancel();
      failedMoveAnimationRef.current?.cancel();
    },
    [],
  );

  React.useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    if (!isEditMode || !isSelected) return;
    if (!failedMoveSignal || failedMoveSignal < 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    moveAnimationRef.current?.cancel();
    failedMoveAnimationRef.current?.cancel();
    failedMoveAnimationRef.current = node.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg)' },
        { transform: 'translate(-5px, 0px) rotate(-2.6deg)', offset: 0.18 },
        { transform: 'translate(5px, 0px) rotate(2.6deg)', offset: 0.36 },
        { transform: 'translate(-3px, 0px) rotate(-1.6deg)', offset: 0.54 },
        { transform: 'translate(3px, 0px) rotate(1.6deg)', offset: 0.72 },
        { transform: 'translate(0px, 0px) rotate(0deg)' },
      ],
      {
        duration: 300,
        easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      },
    );
  }, [failedMoveSignal, isEditMode, isSelected]);

  return (
    <div
      ref={cardRef}
      role={isEditMode ? 'button' : undefined}
      tabIndex={isEditMode ? 0 : undefined}
      aria-pressed={isEditMode ? Boolean(isSelected) : undefined}
      onClick={() => {
        if (isEditMode) onSelect?.();
      }}
      onKeyDown={(event) => {
        if (!isEditMode) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.();
        }
      }}
      style={{
        gridColumnStart: card.ui_config.x + 1,
        gridColumnEnd: `span ${width}`,
        gridRowStart: card.ui_config.y + 1,
        gridRowEnd: `span ${height}`,
      }}
      className={`
        relative group bg-card text-card-foreground rounded-lg border border-border shadow-sm
        flex flex-col overflow-hidden origin-center transition-[box-shadow,border-color,background-color] duration-150 ease-out
        ${getBorderClass(card.ui_config.color_theme)}
        ${isEditMode ? 'cursor-pointer z-20 outline-none' : 'z-10'}
        ${isEditMode ? 'hover:shadow-md' : ''}
        ${selectedInvertedClass}
        h-full
      `}
    >
      <div className="flex items-center justify-between p-4 pb-2 select-none gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {thresholdAlertTriggered && (
            <AlertTriangle
              size={14}
              className="text-amber-500 shrink-0"
              title={tr('cardShell.thresholdAlertTriggered')}
            />
          )}
          <h3 className="font-semibold tracking-tight truncate text-sm text-muted-foreground uppercase">
            {card.title}
          </h3>
        </div>

        {!isEditMode && (
          <div className="relative shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
            >
              <MoreVertical size={14} />
            </Button>

            {menuOpen && (
              <div
                className="absolute right-0 top-6 z-50 w-40 rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 duration-100 cursor-default"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onRefresh?.();
                    setMenuOpen(false);
                  }}
                >
                  <RefreshCw size={12} className="mr-2" /> {tr('cardShell.refresh')}
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onEdit?.();
                    setMenuOpen(false);
                  }}
                >
                  <Settings size={12} className="mr-2" /> {tr('cardShell.edit')}
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onHistory?.();
                    setMenuOpen(false);
                  }}
                >
                  <History size={12} className="mr-2" /> {tr('cardShell.history')}
                </button>
                <button
                  onClick={() => {
                    softDeleteCard(card.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-red-500 hover:bg-red-950/20"
                >
                  <Trash2 size={12} className="mr-2" /> {tr('cardShell.delete')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 pt-0 min-h-[100px] flex flex-col justify-center pointer-events-none">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-1/2 bg-muted rounded" />
            <div className="h-8 w-3/4 bg-muted rounded" />
          </div>
        ) : isError ? (
          <div className="text-destructive text-sm flex flex-col items-start justify-center h-full gap-2">
            <div className="flex items-center gap-2">
              <CircleAlert size={18} />
              <p className="font-medium">{tr('cardShell.executionError')}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {card.runtimeData?.error || tr('cardShell.scriptExecutionFailed')}
            </p>
            {card.runtimeData?.stderr && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">stderr: {card.runtimeData.stderr}</p>
            )}
          </div>
        ) : (
          <div className={`${isEditMode ? 'pointer-events-none' : 'pointer-events-auto'} h-full w-full flex flex-col`}>
            {children}
          </div>
        )}
      </div>

      {!isEditMode && (
        <div className="px-4 pb-3 flex items-center justify-between text-[11px] text-muted-foreground/90">
        <div className="inline-flex items-center gap-1">
          {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <Clock3 size={12} />}
          <span>
            {isLoading
              ? tr('cardShell.refreshing')
              : formatTime(card.runtimeData?.lastUpdated, language, tr('cardShell.never'))}
          </span>
        </div>
          {card.runtimeData?.state === 'error' && <AlertCircle size={12} className="text-destructive" />}
        </div>
      )}

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 cursor-default"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
};
