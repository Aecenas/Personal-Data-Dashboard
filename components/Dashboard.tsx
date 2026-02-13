import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { CardShell } from './ui/CardShell';
import { ScalarCard } from './cards/ScalarCard';
import { SeriesCard } from './cards/SeriesCard';
import { StatusCard } from './cards/StatusCard';
import { Plus, LayoutTemplate, Check, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from '../types';

interface DashboardProps {
  onAddClick: () => void;
  onEditCard: (cardId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onAddClick, onEditCard }) => {
  const {
    cards,
    activeGroup,
    setActiveGroup,
    isEditMode,
    toggleEditMode,
    moveCard,
    refreshAllCards,
    refreshCard,
  } = useStore();

  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragCardSize, setDragCardSize] = useState<{ w: number; h: number } | null>(null);

  const visibleCards = useMemo(() => cards.filter((card) => !card.status.is_deleted), [cards]);

  const displayedCards = useMemo(
    () =>
      activeGroup === 'All' ? visibleCards : visibleCards.filter((card) => card.group === activeGroup),
    [activeGroup, visibleCards],
  );

  const groups = useMemo(() => {
    const groupSet = new Set(visibleCards.map((card) => card.group));
    return ['All', ...Array.from(groupSet).sort()];
  }, [visibleCards]);

  const maxRow = useMemo(() => {
    if (displayedCards.length === 0) return 3;

    let max = 0;
    displayedCards.forEach((card) => {
      const height = card.ui_config.size.endsWith('2') ? 2 : 1;
      const y = card.ui_config.y;
      if (y + height > max) max = y + height;
    });

    return isEditMode ? max + 2 : max;
  }, [displayedCards, isEditMode]);

  const isOccupied = (x: number, y: number, excludeId: string | null) => {
    return displayedCards.some((card) => {
      if (card.id === excludeId) return false;

      const width = card.ui_config.size.startsWith('2') ? 2 : 1;
      const height = card.ui_config.size.endsWith('2') ? 2 : 1;
      const cx = card.ui_config.x;
      const cy = card.ui_config.y;

      return x >= cx && x < cx + width && y >= cy && y < cy + height;
    });
  };

  const canPlace = (
    targetX: number,
    targetY: number,
    width: number,
    height: number,
    excludeId: string | null,
  ) => {
    if (targetX + width > 4) return false;

    for (let i = 0; i < width; i += 1) {
      for (let j = 0; j < height; j += 1) {
        if (isOccupied(targetX + i, targetY + j, excludeId)) return false;
      }
    }

    return true;
  };

  const handleDragStart = (event: React.DragEvent, cardId: string, size: Card['ui_config']['size']) => {
    setDraggingCardId(cardId);
    const width = size.startsWith('2') ? 2 : 1;
    const height = size.endsWith('2') ? 2 : 1;
    setDragCardSize({ w: width, h: height });
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverCell = (event: React.DragEvent, x: number, y: number) => {
    event.preventDefault();
    if (!draggingCardId || !dragCardSize) return;

    const valid = canPlace(x, y, dragCardSize.w, dragCardSize.h, draggingCardId);
    event.dataTransfer.dropEffect = valid ? 'move' : 'none';
  };

  const handleDropCell = (event: React.DragEvent, x: number, y: number) => {
    event.preventDefault();
    if (draggingCardId && dragCardSize && canPlace(x, y, dragCardSize.w, dragCardSize.h, draggingCardId)) {
      moveCard(draggingCardId, x, y);
    }

    setDraggingCardId(null);
    setDragCardSize(null);
  };

  const gridCells = useMemo(() => {
    if (!isEditMode) return null;

    const cells = [];
    for (let y = 0; y < maxRow; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const occupied = isOccupied(x, y, draggingCardId);
        cells.push(
          <div
            key={`${x}-${y}`}
            onDragOver={(event) => handleDragOverCell(event, x, y)}
            onDrop={(event) => handleDropCell(event, x, y)}
            className={`
              border-2 rounded-lg transition-all duration-200
              ${
                occupied
                  ? 'border-border/50 bg-secondary/10'
                  : 'border-dashed border-border hover:border-primary/50 hover:bg-primary/5'
              }
            `}
            style={{
              gridColumnStart: x + 1,
              gridColumnEnd: 'span 1',
              gridRowStart: y + 1,
              gridRowEnd: 'span 1',
            }}
          />,
        );
      }
    }

    return cells;
  }, [maxRow, isEditMode, draggingCardId, displayedCards]);

  const renderCard = (card: Card) => {
    if (card.type === 'scalar') return <ScalarCard card={card} />;
    if (card.type === 'series') return <SeriesCard card={card} />;
    return <StatusCard card={card} />;
  };

  return (
    <div className="p-4 md:p-8 space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MyMetrics</h1>
          <p className="text-muted-foreground mt-1">Personal Data & Scripts Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <Button
              onClick={toggleEditMode}
              variant="secondary"
              className="bg-primary/10 text-primary border border-primary/20"
            >
              <Check size={16} className="mr-2" /> Done Editing
            </Button>
          ) : (
            <>
              <Button onClick={() => refreshAllCards('manual')} variant="outline">
                <RefreshCw size={16} className="mr-2" /> Refresh All
              </Button>
              <Button onClick={toggleEditMode} variant="outline">
                <LayoutTemplate size={16} className="mr-2" /> Edit Layout
              </Button>
              <Button
                onClick={onAddClick}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                <Plus size={16} className="mr-2" /> Add Card
              </Button>
            </>
          )}
        </div>
      </div>

      <div
        className={`flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0 ${
          isEditMode ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        {groups.map((group) => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className={`
              px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap
              ${
                activeGroup === group
                  ? 'bg-foreground text-background shadow-md'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }
            `}
          >
            {group}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto relative min-h-[500px] border border-transparent">
        {displayedCards.length === 0 && !isEditMode ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl bg-card/30 mt-8">
            <p className="text-muted-foreground">No metrics found in this group.</p>
            <Button variant="link" onClick={onAddClick} className="mt-2">
              Create your first card
            </Button>
          </div>
        ) : (
          <div
            className="grid grid-cols-4 auto-rows-[180px] gap-4 pb-20 relative"
            style={{ minHeight: isEditMode ? `${maxRow * 196}px` : 'auto' }}
          >
            {gridCells}

            {displayedCards.map((card) => (
              <CardShell
                key={card.id}
                card={card}
                isEditMode={isEditMode}
                isDragging={draggingCardId === card.id}
                onDragStart={handleDragStart}
                onRefresh={() => refreshCard(card.id)}
                onEdit={() => onEditCard(card.id)}
              >
                {renderCard(card)}
              </CardShell>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
