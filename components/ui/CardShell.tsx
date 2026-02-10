import React from 'react';
import { Card as CardType } from '../../types';
import { MoreVertical, RefreshCw, Trash2, Settings, AlertCircle, Move } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from './Button';

interface CardShellProps {
  card: CardType;
  children: React.ReactNode;
  isEditMode: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent, id: string, size: string) => void;
}

export const CardShell: React.FC<CardShellProps> = ({ 
  card, 
  children,
  isEditMode,
  isDragging,
  onDragStart
}) => {
  const { softDeleteCard } = useStore();
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Calculate grid spans
  const w = card.ui_config.size.startsWith('2') ? 2 : 1;
  const h = card.ui_config.size.endsWith('2') ? 2 : 1;

  // Border color based on theme
  const getBorderClass = (theme: string) => {
    switch(theme) {
      case 'blue': return 'border-t-4 border-t-blue-500';
      case 'green': return 'border-t-4 border-t-emerald-500';
      case 'red': return 'border-t-4 border-t-rose-500';
      case 'purple': return 'border-t-4 border-t-violet-500';
      case 'yellow': return 'border-t-4 border-t-amber-500';
      default: return 'border-t-4 border-t-border';
    }
  };

  return (
    <div 
      draggable={isEditMode}
      onDragStart={(e) => {
        if (isEditMode && onDragStart) {
          onDragStart(e, card.id, card.ui_config.size);
        }
      }}
      style={{
        gridColumnStart: card.ui_config.x + 1,
        gridColumnEnd: `span ${w}`,
        gridRowStart: card.ui_config.y + 1,
        gridRowEnd: `span ${h}`,
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
      {/* Edit Mode Overlay */}
      {isEditMode && !isDragging && (
        <div className="absolute inset-0 bg-background/5 z-30 pointer-events-none flex items-center justify-center">
           <div className="bg-background/80 p-2 rounded-full shadow-sm backdrop-blur-sm border border-border">
              <Move size={20} className="text-primary" />
           </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2 select-none">
        <div className="flex items-center gap-2 overflow-hidden">
          <h3 className="font-semibold tracking-tight truncate text-sm text-muted-foreground uppercase">
            {card.title}
          </h3>
        </div>
        
        {!isEditMode && (
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
            >
              <MoreVertical size={14} />
            </Button>

            {menuOpen && (
              <div className="absolute right-0 top-6 z-50 w-32 rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 duration-100 cursor-default"
                   onClick={(e) => e.stopPropagation()}
              >
                <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground">
                  <RefreshCw size={12} className="mr-2" /> Refresh
                </button>
                <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground">
                  <Settings size={12} className="mr-2" /> Edit
                </button>
                <button 
                  onClick={() => { softDeleteCard(card.id); setMenuOpen(false); }}
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-red-500 hover:bg-red-950/20"
                >
                  <Trash2 size={12} className="mr-2" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pt-0 min-h-[100px] flex flex-col justify-center pointer-events-none">
         {card.runtimeData?.isLoading ? (
           <div className="animate-pulse space-y-2">
             <div className="h-4 w-1/2 bg-muted rounded"></div>
             <div className="h-8 w-3/4 bg-muted rounded"></div>
           </div>
         ) : card.runtimeData?.error ? (
           <div className="text-destructive text-sm flex flex-col items-center justify-center h-full">
             <AlertCircle size={24} className="mb-2" />
             <p>Execution Error</p>
           </div>
         ) : (
           <div className="pointer-events-auto h-full w-full flex flex-col">
             {children}
           </div>
         )}
      </div>
      
      {/* Menu Backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
        }}></div>
      )}
    </div>
  );
};