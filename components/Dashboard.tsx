import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { CardShell } from './ui/CardShell';
import { ScalarCard } from './cards/ScalarCard';
import { SeriesCard } from './cards/SeriesCard';
import { StatusCard } from './cards/StatusCard';
import { Plus, LayoutTemplate, Check, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from '../types';
import { t } from '../i18n';
import { getCardLayoutPosition } from '../layout';

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
    language,
  } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const visibleCards = useMemo(() => cards.filter((card) => !card.status.is_deleted), [cards]);

  const displayedCards = useMemo(
    () =>
      (activeGroup === 'All' ? visibleCards : visibleCards.filter((card) => card.group === activeGroup)).map(
        (card) => {
          const position = getCardLayoutPosition(card, activeGroup);
          if (card.ui_config.x === position.x && card.ui_config.y === position.y) return card;
          return {
            ...card,
            ui_config: {
              ...card.ui_config,
              x: position.x,
              y: position.y,
            },
          };
        },
      ),
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

  const selectedCard = useMemo(
    () => displayedCards.find((card) => card.id === selectedCardId) ?? null,
    [displayedCards, selectedCardId],
  );

  useEffect(() => {
    if (!isEditMode) {
      setSelectedCardId(null);
      return;
    }

    if (displayedCards.length === 0) {
      setSelectedCardId(null);
      return;
    }

    const selectedStillVisible = selectedCardId
      ? displayedCards.some((card) => card.id === selectedCardId)
      : false;

    if (!selectedStillVisible) {
      setSelectedCardId(displayedCards[0].id);
    }
  }, [isEditMode, displayedCards, selectedCardId]);

  useEffect(() => {
    if (!isEditMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedCardId) return;
      if (!selectedCard) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      let dx = 0;
      let dy = 0;
      if (event.key === 'ArrowUp') dy = -1;
      if (event.key === 'ArrowDown') dy = 1;
      if (event.key === 'ArrowLeft') dx = -1;
      if (event.key === 'ArrowRight') dx = 1;
      if (!dx && !dy) return;

      event.preventDefault();

      moveCard(
        selectedCardId,
        selectedCard.ui_config.x + dx,
        selectedCard.ui_config.y + dy,
        activeGroup === 'All' ? undefined : activeGroup,
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, selectedCardId, selectedCard, moveCard, activeGroup]);

  const handleToggleEditMode = () => {
    toggleEditMode();
  };

  const renderCard = (card: Card) => {
    if (card.type === 'scalar') return <ScalarCard card={card} />;
    if (card.type === 'series') return <SeriesCard card={card} />;
    return <StatusCard card={card} />;
  };

  return (
    <div className="p-4 md:p-8 h-full min-h-0 flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MyMetrics</h1>
          <p className="text-muted-foreground mt-1">{tr('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <Button
              onClick={handleToggleEditMode}
              variant="secondary"
              className="bg-primary/10 text-primary border border-primary/20"
            >
              <Check size={16} className="mr-2" /> {tr('dashboard.doneEditing')}
            </Button>
          ) : (
            <>
              <Button onClick={() => refreshAllCards('manual')} variant="outline">
                <RefreshCw size={16} className="mr-2" /> {tr('dashboard.refreshAll')}
              </Button>
              <Button onClick={handleToggleEditMode} variant="outline">
                <LayoutTemplate size={16} className="mr-2" /> {tr('dashboard.editLayout')}
              </Button>
              <Button
                onClick={onAddClick}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                <Plus size={16} className="mr-2" /> {tr('dashboard.addCard')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
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
            {group === 'All' ? tr('common.all') : group}
          </button>
        ))}
      </div>

      {isEditMode && (
        <div className="shrink-0 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
          <div className="font-medium text-primary">{tr('dashboard.layoutEditHint')}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedCard
              ? tr('dashboard.layoutEditSelected', { title: selectedCard.title })
              : tr('dashboard.layoutEditNoSelection')}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto relative border border-transparent">
        {displayedCards.length === 0 && !isEditMode ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl bg-card/30 mt-8">
            <p className="text-muted-foreground">{tr('dashboard.noMetricsInGroup')}</p>
            <Button variant="link" onClick={onAddClick} className="mt-2">
              {tr('dashboard.createFirstCard')}
            </Button>
          </div>
        ) : (
          <div
            className="grid grid-cols-4 auto-rows-[180px] gap-4 pb-20 relative"
            style={{ minHeight: isEditMode ? `${maxRow * 196}px` : 'auto' }}
          >
            {displayedCards.map((card) => (
              <CardShell
                key={card.id}
                card={card}
                isEditMode={isEditMode}
                isSelected={selectedCardId === card.id}
                onSelect={() => setSelectedCardId(card.id)}
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
