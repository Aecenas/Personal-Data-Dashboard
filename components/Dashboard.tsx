import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { CardShell } from './ui/CardShell';
import { ScalarCard } from './cards/ScalarCard';
import { SeriesCard } from './cards/SeriesCard';
import { Plus, LayoutTemplate, Check, X as XIcon } from 'lucide-react';
import { Button } from './ui/Button';

interface DashboardProps {
  onAddClick: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onAddClick }) => {
  const { cards, activeGroup, setActiveGroup, isEditMode, toggleEditMode, moveCard } = useStore();
  
  // Dragging State
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragCardSize, setDragCardSize] = useState<{w: number, h: number} | null>(null);

  // Filter active cards
  const visibleCards = useMemo(() => {
    return cards.filter(c => !c.status.is_deleted);
  }, [cards]);

  const displayedCards = activeGroup === 'All' 
    ? visibleCards 
    : visibleCards.filter(c => c.group === activeGroup);

  const groups = useMemo(() => {
    const g = new Set(visibleCards.map(c => c.group));
    return ['All', ...Array.from(g)];
  }, [visibleCards]);

  // Determine Grid Height (rows)
  const maxRow = useMemo(() => {
    if (displayedCards.length === 0) return 3;
    let max = 0;
    displayedCards.forEach(c => {
      const h = c.ui_config.size.endsWith('2') ? 2 : 1;
      const y = c.ui_config.y;
      if (y + h > max) max = y + h;
    });
    // Add extra space at bottom for dragging new items
    return isEditMode ? max + 2 : max;
  }, [displayedCards, isEditMode]);

  // Collision Detection Helper
  const isOccupied = (x: number, y: number, excludeId: string | null) => {
    return displayedCards.some(c => {
      if (c.id === excludeId) return false;
      const w = c.ui_config.size.startsWith('2') ? 2 : 1;
      const h = c.ui_config.size.endsWith('2') ? 2 : 1;
      const cx = c.ui_config.x;
      const cy = c.ui_config.y;
      
      return x >= cx && x < cx + w && y >= cy && y < cy + h;
    });
  };

  const canPlace = (targetX: number, targetY: number, w: number, h: number, excludeId: string | null) => {
    // Check boundaries
    if (targetX + w > 4) return false; // Exceeds width
    
    // Check overlap for every cell the card would occupy
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        if (isOccupied(targetX + i, targetY + j, excludeId)) return false;
      }
    }
    return true;
  };

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, id: string, size: string) => {
    setDraggingCardId(id);
    const w = size.startsWith('2') ? 2 : 1;
    const h = size.endsWith('2') ? 2 : 1;
    setDragCardSize({ w, h });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverCell = (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault(); // Allow drop
    if (!draggingCardId || !dragCardSize) return;

    const isValid = canPlace(x, y, dragCardSize.w, dragCardSize.h, draggingCardId);
    e.dataTransfer.dropEffect = isValid ? 'move' : 'none';
  };

  const handleDropCell = (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    if (draggingCardId && dragCardSize) {
      if (canPlace(x, y, dragCardSize.w, dragCardSize.h, draggingCardId)) {
        moveCard(draggingCardId, x, y);
      }
    }
    setDraggingCardId(null);
    setDragCardSize(null);
  };

  // Generate Grid Cells for Edit Mode
  const gridCells = useMemo(() => {
    if (!isEditMode) return null;
    const cells = [];
    for (let y = 0; y < maxRow; y++) {
      for (let x = 0; x < 4; x++) {
        const occupied = isOccupied(x, y, draggingCardId);
        
        cells.push(
          <div
            key={`${x}-${y}`}
            onDragOver={(e) => handleDragOverCell(e, x, y)}
            onDrop={(e) => handleDropCell(e, x, y)}
            className={`
              border-2 rounded-lg transition-all duration-200
              ${occupied 
                ? 'border-border/50 bg-secondary/10' // Existing card (not being dragged) is here
                : 'border-dashed border-border hover:border-primary/50 hover:bg-primary/5' // Empty slot
              }
            `}
            style={{
              gridColumnStart: x + 1,
              gridColumnEnd: 'span 1',
              gridRowStart: y + 1,
              gridRowEnd: 'span 1',
            }}
          />
        );
      }
    }
    return cells;
  }, [maxRow, isEditMode, draggingCardId, displayedCards]); // Re-calc when these change

  return (
    <div className="p-4 md:p-8 space-y-6 h-full flex flex-col">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MyMetrics</h1>
          <p className="text-muted-foreground mt-1">Personal Data & Scripts Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
           {isEditMode ? (
             <Button onClick={toggleEditMode} variant="secondary" className="bg-primary/10 text-primary border border-primary/20">
               <Check size={16} className="mr-2" /> Done Editing
             </Button>
           ) : (
             <>
               <Button onClick={toggleEditMode} variant="outline">
                 <LayoutTemplate size={16} className="mr-2" /> Edit Layout
               </Button>
               <Button onClick={onAddClick} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
                 <Plus size={16} className="mr-2" /> Add Card
               </Button>
             </>
           )}
        </div>
      </div>

      {/* Group Tabs (Disable when editing?) */}
      <div className={`flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0 ${isEditMode ? 'opacity-50 pointer-events-none' : ''}`}>
        {groups.map(group => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className={`
              px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap
              ${activeGroup === group 
                ? 'bg-foreground text-background shadow-md' 
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }
            `}
          >
            {group}
          </button>
        ))}
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-y-auto relative min-h-[500px] border border-transparent">
        {displayedCards.length === 0 && !isEditMode ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl bg-card/30 mt-8">
            <p className="text-muted-foreground">No metrics found in this group.</p>
            <Button variant="link" onClick={onAddClick} className="mt-2">Create your first card</Button>
          </div>
        ) : (
          <div 
            className="grid grid-cols-4 auto-rows-[180px] gap-4 pb-20 relative"
            style={{ 
              // Ensure the grid has explicit rows if in edit mode to show empty slots at bottom
              minHeight: isEditMode ? `${maxRow * 196}px` : 'auto' 
            }}
          >
            
            {/* Layer 0: Placeholder Grid (Only in Edit Mode) */}
            {gridCells}

            {/* Layer 1: Cards */}
            {displayedCards.map(card => (
              <CardShell 
                key={card.id} 
                card={card}
                isEditMode={isEditMode}
                isDragging={draggingCardId === card.id}
                onDragStart={handleDragStart}
              >
                {card.type === 'scalar' ? <ScalarCard card={card} /> : <SeriesCard card={card} />}
              </CardShell>
            ))}

          </div>
        )}
      </div>
    </div>
  );
};