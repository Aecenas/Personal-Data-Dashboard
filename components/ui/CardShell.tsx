import React from 'react';
import { Card as CardType } from '../../types';
import {
  MoreVertical,
  RefreshCw,
  Trash2,
  Settings,
  AlertCircle,
  Move,
  Clock3,
  CircleAlert,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from './Button';

interface CardShellProps {
  card: CardType;
  children: React.ReactNode;
  isEditMode: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent, id: string, size: CardType['ui_config']['size']) => void;
  onRefresh?: () => void;
  onEdit?: () => void;
}

const formatTime = (value?: number) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
};

export const CardShell: React.FC<CardShellProps> = ({
  card,
  children,
  isEditMode,
  isDragging,
  onDragStart,
  onRefresh,
  onEdit,
}) => {
  const { softDeleteCard } = useStore();
  const [menuOpen, setMenuOpen] = React.useState(false);

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

  return (
    <div
      draggable={isEditMode}
      onDragStart={(event) => {
        if (isEditMode && onDragStart) {
          onDragStart(event, card.id, card.ui_config.size);
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
        flex flex-col overflow-hidden transition-all duration-200 ease-out
        ${getBorderClass(card.ui_config.color_theme)}
        ${isEditMode ? 'cursor-grab active:cursor-grabbing z-20' : 'z-10'}
        ${isEditMode && !isDragging ? 'hover:scale-[1.02] shadow-xl ring-2 ring-primary/20 animate-pulse' : ''}
        ${isDragging ? 'opacity-30 pointer-events-none scale-[0.98] border-dashed grayscale' : ''}
        h-full
      `}
    >
      {isEditMode && !isDragging && (
        <div className="absolute inset-0 bg-background/5 z-30 pointer-events-none flex items-center justify-center">
          <div className="bg-background/80 p-2 rounded-full shadow-sm backdrop-blur-sm border border-border">
            <Move size={20} className="text-primary" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-4 pb-2 select-none gap-2">
        <h3 className="font-semibold tracking-tight truncate text-sm text-muted-foreground uppercase">{card.title}</h3>

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
                className="absolute right-0 top-6 z-50 w-36 rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 duration-100 cursor-default"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onRefresh?.();
                    setMenuOpen(false);
                  }}
                >
                  <RefreshCw size={12} className="mr-2" /> Refresh
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onEdit?.();
                    setMenuOpen(false);
                  }}
                >
                  <Settings size={12} className="mr-2" /> Edit
                </button>
                <button
                  onClick={() => {
                    softDeleteCard(card.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-red-500 hover:bg-red-950/20"
                >
                  <Trash2 size={12} className="mr-2" /> Delete
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
              <p className="font-medium">Execution Error</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {card.runtimeData?.error || '脚本执行失败'}
            </p>
            {card.runtimeData?.stderr && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">stderr: {card.runtimeData.stderr}</p>
            )}
          </div>
        ) : (
          <div className="pointer-events-auto h-full w-full flex flex-col">{children}</div>
        )}
      </div>

      {!isEditMode && (
        <div className="px-4 pb-3 flex items-center justify-between text-[11px] text-muted-foreground/90">
          <div className="inline-flex items-center gap-1">
            {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <Clock3 size={12} />}
            <span>{isLoading ? 'Refreshing...' : formatTime(card.runtimeData?.lastUpdated)}</span>
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
