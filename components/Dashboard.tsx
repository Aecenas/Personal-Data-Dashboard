import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { CardShell } from './ui/CardShell';
import { ScalarCard } from './cards/ScalarCard';
import { SeriesCard } from './cards/SeriesCard';
import { StatusCard } from './cards/StatusCard';
import { GaugeCard } from './cards/GaugeCard';
import { DigestCard } from './cards/DigestCard';
import { Plus, LayoutTemplate, Check, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, SectionMarker } from '../types';
import { t } from '../i18n';
import { getCardLayoutPosition } from '../layout';
import { CardHistoryDialog } from './CardHistoryDialog';
import { DigestPreviewDialog } from './DigestPreviewDialog';
import { interactionSoundService } from '../services/interaction-sound';

interface DashboardProps {
  onAddClick: () => void;
  onEditCard: (cardId: string) => void;
}

const GRID_ROW_HEIGHT = 180;
const GRID_COLUMN_GAP = 16;
const GRID_GAP = 24;
const SECTION_TOP_PADDING = 32;
const GRID_CELL_SPAN = GRID_ROW_HEIGHT + GRID_GAP;
const ROW_INDEX_GUTTER_WIDTH = 30;
const ROW_INDEX_LEFT_OFFSET = -ROW_INDEX_GUTTER_WIDTH + 4;
const SECTION_COLORS: SectionMarker['line_color'][] = ['primary', 'red', 'green', 'blue', 'amber'];
const SECTION_STYLES: SectionMarker['line_style'][] = ['dashed', 'solid'];
const SECTION_LABEL_ALIGNMENTS: SectionMarker['label_align'][] = ['left', 'center', 'right'];
const SECTION_LINE_WIDTHS: SectionMarker['line_width'][] = [1, 2, 3, 4];

interface SectionDialogState {
  mode: 'create' | 'edit';
  targetId?: string;
  rowInput: string;
  titleInput: string;
  lineColor: SectionMarker['line_color'];
  lineStyle: SectionMarker['line_style'];
  lineWidth: SectionMarker['line_width'];
  labelAlign: SectionMarker['label_align'];
}

interface CopyDialogState {
  sourceCardId: string;
  titleInput: string;
  groupInput: string;
  error: string;
}

const normalizeSectionColor = (input: string): SectionMarker['line_color'] => {
  const value = input.trim().toLowerCase();
  return SECTION_COLORS.includes(value as SectionMarker['line_color'])
    ? (value as SectionMarker['line_color'])
    : 'primary';
};

const normalizeSectionStyle = (input: string): SectionMarker['line_style'] => {
  const value = input.trim().toLowerCase();
  return SECTION_STYLES.includes(value as SectionMarker['line_style'])
    ? (value as SectionMarker['line_style'])
    : 'dashed';
};

const normalizeSectionWidth = (input: number): SectionMarker['line_width'] => {
  if (SECTION_LINE_WIDTHS.includes(input as SectionMarker['line_width'])) {
    return input as SectionMarker['line_width'];
  }
  return 2;
};

const normalizeSectionAlignment = (input: string): SectionMarker['label_align'] => {
  const value = input.trim().toLowerCase();
  return SECTION_LABEL_ALIGNMENTS.includes(value as SectionMarker['label_align'])
    ? (value as SectionMarker['label_align'])
    : 'center';
};

const getSectionTone = (lineColor: SectionMarker['line_color']) => {
  switch (lineColor) {
    case 'red':
      return {
        line: 'border-red-500',
        badge: 'border-red-300 text-red-700 bg-red-100 dark:border-red-500/80 dark:text-red-300 dark:bg-red-500/20',
      };
    case 'green':
      return {
        line: 'border-emerald-500',
        badge:
          'border-emerald-300 text-emerald-700 bg-emerald-100 dark:border-emerald-500/80 dark:text-emerald-300 dark:bg-emerald-500/20',
      };
    case 'blue':
      return {
        line: 'border-blue-500',
        badge: 'border-blue-300 text-blue-700 bg-blue-100 dark:border-blue-500/80 dark:text-blue-300 dark:bg-blue-500/20',
      };
    case 'amber':
      return {
        line: 'border-amber-500',
        badge:
          'border-amber-300 text-amber-800 bg-amber-100 dark:border-amber-500/80 dark:text-amber-300 dark:bg-amber-500/20',
      };
    default:
      return {
        line: 'border-primary/75',
        badge: 'border-primary/40 text-foreground bg-background/95 dark:border-primary/70 dark:text-primary dark:bg-background/90',
      };
  }
};

const getSectionLabelAlignmentClass = (labelAlign: SectionMarker['label_align']) => {
  if (labelAlign === 'left') return 'justify-start';
  if (labelAlign === 'right') return 'justify-end';
  return 'justify-center';
};

export const Dashboard: React.FC<DashboardProps> = ({ onAddClick, onEditCard }) => {
  const {
    cards,
    sectionMarkers,
    groups,
    activeGroup,
    dashboardColumns,
    setActiveGroup,
    isEditMode,
    toggleEditMode,
    moveCard,
    addSectionMarker,
    updateSectionMarker,
    removeSectionMarker,
    refreshAllCards,
    refreshCard,
    duplicateCard,
    language,
    theme,
  } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [failedMoveSignal, setFailedMoveSignal] = useState<{ cardId: string | null; nonce: number }>({
    cardId: null,
    nonce: 0,
  });
  const [historyCardId, setHistoryCardId] = useState<string | null>(null);
  const [digestPreviewCardId, setDigestPreviewCardId] = useState<string | null>(null);
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState | null>(null);
  const [sectionDialogError, setSectionDialogError] = useState<string>('');
  const [copyDialog, setCopyDialog] = useState<CopyDialogState | null>(null);

  const visibleCards = useMemo(() => cards.filter((card) => !card.status.is_deleted), [cards]);
  const displayedSections = useMemo(
    () =>
      sectionMarkers
        .filter((section) => section.group === activeGroup)
        .slice()
        .sort((a, b) => {
          if (a.after_row !== b.after_row) return a.after_row - b.after_row;
          if (a.start_col !== b.start_col) return a.start_col - b.start_col;
          return a.id.localeCompare(b.id);
        }),
    [activeGroup, sectionMarkers],
  );

  const displayedCards = useMemo(
    () =>
      visibleCards.filter((card) => card.group === activeGroup).map((card) => {
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
      }),
    [activeGroup, visibleCards],
  );

  const groupTabs = useMemo(() => groups.map((group) => group.name), [groups]);

  const maxRow = useMemo(() => {
    let maxCardRow = 0;
    displayedCards.forEach((card) => {
      const height = card.ui_config.size.endsWith('2') ? 2 : 1;
      const y = card.ui_config.y;
      if (y + height > maxCardRow) maxCardRow = y + height;
    });

    const maxSectionRow = displayedSections.reduce((max, section) => Math.max(max, section.after_row + 1), 0);
    const baseMaxRow = Math.max(maxCardRow, maxSectionRow, 3);

    return isEditMode ? baseMaxRow + 2 : baseMaxRow;
  }, [displayedCards, displayedSections, isEditMode]);

  const selectedCard = useMemo(
    () => displayedCards.find((card) => card.id === selectedCardId) ?? null,
    [displayedCards, selectedCardId],
  );
  const historyCard = useMemo(
    () => visibleCards.find((card) => card.id === historyCardId) ?? null,
    [visibleCards, historyCardId],
  );
  const digestPreviewCard = useMemo(
    () => visibleCards.find((card) => card.id === digestPreviewCardId) ?? null,
    [visibleCards, digestPreviewCardId],
  );

  useEffect(() => {
    if (!isEditMode) {
      setSelectedCardId(null);
      setSectionDialog(null);
      setSectionDialogError('');
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
    if (historyCardId && !historyCard) {
      setHistoryCardId(null);
    }
  }, [historyCardId, historyCard]);

  useEffect(() => {
    if (digestPreviewCardId && !digestPreviewCard) {
      setDigestPreviewCardId(null);
    }
  }, [digestPreviewCard, digestPreviewCardId]);

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

      const moved = moveCard(
        selectedCardId,
        selectedCard.ui_config.x + dx,
        selectedCard.ui_config.y + dy,
        activeGroup,
      );

      if (!moved) {
        interactionSoundService.play('card.blocked');
        setFailedMoveSignal((value) => ({ cardId: selectedCardId, nonce: value.nonce + 1 }));
        return;
      }
      interactionSoundService.play('card.move');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, selectedCardId, selectedCard, moveCard, activeGroup]);

  const handleToggleEditMode = () => {
    toggleEditMode();
  };

  const getCardWidth = (cardSize: Card['ui_config']['size']) => (cardSize.startsWith('2') ? 2 : 1);
  const getCardHeight = (cardSize: Card['ui_config']['size']) => (cardSize.endsWith('2') ? 2 : 1);

  const createSectionStyle = (section: SectionMarker): React.CSSProperties => {
    const top = SECTION_TOP_PADDING + (section.after_row + 1) * GRID_CELL_SPAN - GRID_GAP / 2;

    return {
      top: `${top}px`,
      left: 0,
      right: 0,
    };
  };

  const adjustSection = (section: SectionMarker, updates: Partial<SectionMarker>) => {
    updateSectionMarker(section.id, updates);
  };

  const openSectionCreateDialog = () => {
    interactionSoundService.play('modal.open');
    const defaultTitle = tr('dashboard.sectionDefaultTitle', { index: displayedSections.length + 1 });
    const defaultAfterRow = selectedCard
      ? selectedCard.ui_config.y + getCardHeight(selectedCard.ui_config.size)
      : 3;

    setSectionDialog({
      mode: 'create',
      rowInput: String(defaultAfterRow),
      titleInput: defaultTitle,
      lineColor: 'primary',
      lineStyle: 'dashed',
      lineWidth: 2,
      labelAlign: 'center',
    });
    setSectionDialogError('');
  };

  const openSectionEditDialog = (section: SectionMarker) => {
    interactionSoundService.play('modal.open');
    setSectionDialog({
      mode: 'edit',
      targetId: section.id,
      rowInput: String(section.after_row + 1),
      titleInput: section.title,
      lineColor: section.line_color,
      lineStyle: section.line_style,
      lineWidth: section.line_width,
      labelAlign: section.label_align,
    });
    setSectionDialogError('');
  };

  const closeSectionDialog = (playSound = true) => {
    if (playSound) interactionSoundService.play('modal.close');
    setSectionDialog(null);
    setSectionDialogError('');
  };

  const handleDeleteSection = (section: SectionMarker) => {
    if (!window.confirm(tr('dashboard.sectionDeleteConfirm'))) return;
    interactionSoundService.play('action.destructive');
    removeSectionMarker(section.id);
  };

  const handleSubmitSectionDialog = () => {
    if (!sectionDialog) return;

    const parsedRow = Number.parseInt(sectionDialog.rowInput.trim(), 10);
    if (!Number.isFinite(parsedRow) || parsedRow < 0) {
      interactionSoundService.play('action.error');
      setSectionDialogError(tr('dashboard.sectionInvalidRow'));
      return;
    }

    const parsedLineWidth = Number.parseInt(String(sectionDialog.lineWidth), 10);
    if (!Number.isFinite(parsedLineWidth) || parsedLineWidth < 1 || parsedLineWidth > 4) {
      interactionSoundService.play('action.error');
      setSectionDialogError(tr('dashboard.sectionInvalidWidth'));
      return;
    }

    const titleValue = sectionDialog.titleInput.trim();
    const defaultTitle = tr('dashboard.sectionDefaultTitle', { index: displayedSections.length + 1 });
    const normalizedPayload = {
      title: titleValue || defaultTitle,
      after_row: parsedRow - 1,
      line_color: normalizeSectionColor(sectionDialog.lineColor),
      line_style: normalizeSectionStyle(sectionDialog.lineStyle),
      line_width: normalizeSectionWidth(parsedLineWidth),
      label_align: normalizeSectionAlignment(sectionDialog.labelAlign),
    };

    if (sectionDialog.mode === 'edit' && sectionDialog.targetId) {
      updateSectionMarker(sectionDialog.targetId, normalizedPayload);
      interactionSoundService.play('action.success');
      closeSectionDialog(false);
      return;
    }

    const start_col = selectedCard ? selectedCard.ui_config.x : 0;
    const span_col = selectedCard ? getCardWidth(selectedCard.ui_config.size) : 2;

    addSectionMarker({
      title: normalizedPayload.title,
      group: activeGroup,
      start_col,
      span_col,
      after_row: normalizedPayload.after_row,
      line_color: normalizedPayload.line_color,
      line_style: normalizedPayload.line_style,
      line_width: normalizedPayload.line_width,
      label_align: normalizedPayload.label_align,
    });
    interactionSoundService.play('action.success');
    closeSectionDialog(false);
  };

  const updateSectionDialog = <K extends keyof SectionDialogState>(key: K, value: SectionDialogState[K]) => {
    setSectionDialog((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (sectionDialogError) setSectionDialogError('');
  };

  const handleAddSection = () => {
    openSectionCreateDialog();
  };

  const openCopyDialog = (card: Card) => {
    interactionSoundService.play('modal.open');
    setCopyDialog({
      sourceCardId: card.id,
      titleInput: `${card.title}_Copy`,
      groupInput: card.group,
      error: '',
    });
  };

  const closeCopyDialog = (playSound = true) => {
    if (playSound) interactionSoundService.play('modal.close');
    setCopyDialog(null);
  };

  const updateCopyDialog = (updates: Partial<CopyDialogState>) => {
    setCopyDialog((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const handleSubmitCopyDialog = () => {
    if (!copyDialog) return;

    const title = copyDialog.titleInput.trim();
    if (!title) {
      interactionSoundService.play('action.error');
      updateCopyDialog({ error: tr('dashboard.copyErrorTitleRequired') });
      return;
    }

    const targetGroup = copyDialog.groupInput.trim();
    const groupNames = groups.map((group) => group.name);
    if (!groupNames.includes(targetGroup)) {
      interactionSoundService.play('action.error');
      updateCopyDialog({ error: tr('dashboard.copyErrorGroupInvalid') });
      return;
    }

    const result = duplicateCard(copyDialog.sourceCardId, {
      title,
      group: targetGroup,
    });

    if ('error' in result) {
      interactionSoundService.play('action.error');
      if (result.error === 'not_found') {
        updateCopyDialog({ error: tr('dashboard.copyErrorSourceMissing') });
        return;
      }
      if (result.error === 'deleted') {
        updateCopyDialog({ error: tr('dashboard.copyErrorSourceDeleted') });
        return;
      }
      if (result.error === 'invalid_group') {
        updateCopyDialog({ error: tr('dashboard.copyErrorGroupInvalid') });
        return;
      }
      updateCopyDialog({ error: tr('dashboard.copyErrorTitleRequired') });
      return;
    }

    interactionSoundService.play('action.success');
    closeCopyDialog(false);
  };

  const handleRefreshAll = () => {
    interactionSoundService.play('refresh.trigger');
    void refreshAllCards('manual');
  };

  const handleRefreshCard = (cardId: string) => {
    interactionSoundService.play('refresh.trigger');
    void refreshCard(cardId);
  };

  const openHistoryDialog = (cardId: string) => {
    interactionSoundService.play('modal.open');
    setHistoryCardId(cardId);
  };

  const closeHistoryDialog = () => {
    interactionSoundService.play('modal.close');
    setHistoryCardId(null);
  };

  const openDigestPreviewDialog = (cardId: string) => {
    interactionSoundService.play('modal.open');
    setDigestPreviewCardId(cardId);
  };

  const closeDigestPreviewDialog = () => {
    interactionSoundService.play('modal.close');
    setDigestPreviewCardId(null);
  };

  const renderCard = (card: Card) => {
    if (card.type === 'scalar') return <ScalarCard card={card} />;
    if (card.type === 'series') return <SeriesCard card={card} />;
    if (card.type === 'status') return <StatusCard card={card} />;
    if (card.type === 'digest') {
      return <DigestCard card={card} onOpenPreview={() => openDigestPreviewDialog(card.id)} />;
    }
    return <GaugeCard card={card} />;
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
            <>
              <Button
                onClick={handleAddSection}
                data-sound="none"
                variant="outline"
                className="border-dashed"
              >
                <Plus size={16} className="mr-2" /> {tr('dashboard.addSection')}
              </Button>
              <Button
                onClick={handleToggleEditMode}
                variant="secondary"
                className="bg-primary/10 text-primary border border-primary/20"
              >
                <Check size={16} className="mr-2" /> {tr('dashboard.doneEditing')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleRefreshAll} data-sound="none" variant="outline">
                <RefreshCw size={16} className="mr-2" /> {tr('dashboard.refreshAll')}
              </Button>
              <Button onClick={handleToggleEditMode} variant="outline">
                <LayoutTemplate size={16} className="mr-2" /> {tr('dashboard.editLayout')}
              </Button>
              <Button
                onClick={onAddClick}
                data-sound="none"
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                <Plus size={16} className="mr-2" /> {tr('dashboard.addCard')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
        {groupTabs.map((group) => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            data-sound="nav.switch"
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

      <div
        className="flex-1 min-h-0 overflow-y-auto relative border border-transparent"
        style={{ paddingLeft: isEditMode ? `${ROW_INDEX_GUTTER_WIDTH}px` : undefined }}
      >
        {displayedCards.length === 0 && !isEditMode ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl bg-card/30 mt-8">
            <p className="text-muted-foreground">{tr('dashboard.noMetricsInGroup')}</p>
            <Button variant="link" onClick={onAddClick} data-sound="none" className="mt-2">
              {tr('dashboard.createFirstCard')}
            </Button>
          </div>
        ) : (
          <div
            className="grid auto-rows-[180px] pb-20 relative"
            style={{
              paddingTop: `${SECTION_TOP_PADDING}px`,
              rowGap: `${GRID_GAP}px`,
              columnGap: `${GRID_COLUMN_GAP}px`,
              gridTemplateColumns: `repeat(${dashboardColumns}, minmax(0, 1fr))`,
              minHeight: isEditMode ? `${SECTION_TOP_PADDING + maxRow * GRID_CELL_SPAN}px` : 'auto',
            }}
          >
            {isEditMode &&
              Array.from({ length: maxRow + 1 }, (_, index) => {
                const row = index;
                const top = SECTION_TOP_PADDING + row * GRID_CELL_SPAN - GRID_GAP / 2;
                return (
                  <div
                    key={`row-index-${row}`}
                    className="absolute z-40 pointer-events-none"
                    style={{ left: `${ROW_INDEX_LEFT_OFFSET}px`, top: `${top}px`, transform: 'translateY(-50%)' }}
                  >
                    <span
                      className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1 text-[10px] shadow-sm ${
                        theme === 'dark'
                          ? 'border border-slate-400/30 bg-slate-900 text-slate-100'
                          : 'border border-slate-400/70 bg-white text-slate-800'
                      }`}
                    >
                      {row}
                    </span>
                  </div>
                );
              })}
            {displayedSections.map((section) => (
              <div key={section.id} className="absolute z-30 pointer-events-none" style={createSectionStyle(section)}>
                <div
                  className="grid -translate-y-1/2"
                  style={{
                    gridTemplateColumns: `repeat(${dashboardColumns}, minmax(0, 1fr))`,
                    columnGap: `${GRID_COLUMN_GAP}px`,
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      gridColumnStart: section.start_col + 1,
                      gridColumnEnd: `span ${section.span_col}`,
                    }}
                  >
                    <div className="relative flex items-center">
                      <div
                        className={`absolute inset-x-0 top-1/2 -translate-y-1/2 border-t z-0 ${
                          section.line_style === 'dashed' ? 'border-dashed' : 'border-solid'
                        } ${getSectionTone(section.line_color).line}`}
                        style={{ borderTopWidth: `${section.line_width}px` }}
                      />
                      <div className={`relative z-10 flex w-full ${getSectionLabelAlignmentClass(section.label_align)}`}>
                        <div className="relative inline-flex max-w-full">
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-full bg-background pointer-events-none"
                          />
                          {isEditMode ? (
                            <button
                              type="button"
                              data-sound="none"
                              className={`relative max-w-full truncate rounded-full border px-3 py-0.5 text-xs pointer-events-auto ${
                                getSectionTone(section.line_color).badge
                              }`}
                              onClick={() => openSectionEditDialog(section)}
                            >
                              {section.title}
                            </button>
                          ) : (
                            <span
                              className={`relative max-w-full truncate rounded-full border px-3 py-0.5 text-xs ${
                                getSectionTone(section.line_color).badge
                              }`}
                            >
                              {section.title}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {isEditMode && (
                  <div className="mt-1 flex items-center justify-center gap-1 pointer-events-auto">
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-border bg-card text-[10px] leading-none"
                      onClick={() => adjustSection(section, { after_row: section.after_row - 1 })}
                      aria-label={tr('dashboard.sectionMoveUp')}
                      title={tr('dashboard.sectionMoveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-border bg-card text-[10px] leading-none"
                      onClick={() => adjustSection(section, { after_row: section.after_row + 1 })}
                      aria-label={tr('dashboard.sectionMoveDown')}
                      title={tr('dashboard.sectionMoveDown')}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-border bg-card text-[10px] leading-none"
                      onClick={() => adjustSection(section, { start_col: section.start_col - 1 })}
                      aria-label={tr('dashboard.sectionMoveLeft')}
                      title={tr('dashboard.sectionMoveLeft')}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-border bg-card text-[10px] leading-none"
                      onClick={() => adjustSection(section, { start_col: section.start_col + 1 })}
                      aria-label={tr('dashboard.sectionMoveRight')}
                      title={tr('dashboard.sectionMoveRight')}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-border bg-card text-[10px] leading-none"
                      onClick={() => adjustSection(section, { span_col: section.span_col - 1 })}
                      aria-label={tr('dashboard.sectionNarrow')}
                      title={tr('dashboard.sectionNarrow')}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-border bg-card text-[10px] leading-none"
                      onClick={() => adjustSection(section, { span_col: section.span_col + 1 })}
                      aria-label={tr('dashboard.sectionWiden')}
                      title={tr('dashboard.sectionWiden')}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-red-500/40 bg-red-500/10 text-[10px] leading-none text-red-400"
                      onClick={() => handleDeleteSection(section)}
                      aria-label={tr('dashboard.sectionDelete')}
                      title={tr('dashboard.sectionDelete')}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))}
            {displayedCards.map((card) => (
              <CardShell
                key={card.id}
                card={card}
                isEditMode={isEditMode}
                isSelected={selectedCardId === card.id}
                failedMoveSignal={failedMoveSignal.cardId === card.id ? failedMoveSignal.nonce : undefined}
                onSelect={() => setSelectedCardId(card.id)}
                onRefresh={() => handleRefreshCard(card.id)}
                onEdit={() => onEditCard(card.id)}
                onCopy={() => openCopyDialog(card)}
                onHistory={() => openHistoryDialog(card.id)}
              >
                {renderCard(card)}
              </CardShell>
            ))}
          </div>
        )}
      </div>

      {copyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-base font-semibold text-foreground">{tr('dashboard.copyDialogTitle')}</h3>
              <Button
                variant="ghost"
                size="icon"
                data-sound="none"
                aria-label={tr('dashboard.closeDialog')}
                title={tr('dashboard.closeDialog')}
                onClick={() => closeCopyDialog()}
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{tr('dashboard.copyNameLabel')}</label>
                <input
                  type="text"
                  value={copyDialog.titleInput}
                  onChange={(event) => updateCopyDialog({ titleInput: event.target.value, error: '' })}
                  placeholder={tr('dashboard.copyNamePlaceholder')}
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tr('dashboard.copyGroupLabel')}</label>
                <select
                  value={copyDialog.groupInput}
                  onChange={(event) => updateCopyDialog({ groupInput: event.target.value, error: '' })}
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.name}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              {copyDialog.error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
                  {copyDialog.error}
                </div>
              )}
            </div>

            <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-2">
              <Button variant="ghost" data-sound="none" onClick={() => closeCopyDialog()}>
                {tr('common.cancel')}
              </Button>
              <Button data-sound="none" onClick={handleSubmitCopyDialog}>{tr('dashboard.copyConfirm')}</Button>
            </div>
          </div>
        </div>
      )}

      {sectionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-base font-semibold text-foreground">
                {sectionDialog.mode === 'create'
                  ? tr('dashboard.sectionDialogCreateTitle')
                  : tr('dashboard.sectionDialogEditTitle')}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                data-sound="none"
                aria-label={tr('dashboard.closeDialog')}
                title={tr('dashboard.closeDialog')}
                onClick={() => closeSectionDialog()}
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{tr('dashboard.sectionFormRow')}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={sectionDialog.rowInput}
                  onChange={(event) => updateSectionDialog('rowInput', event.target.value)}
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tr('dashboard.sectionFormTitle')}</label>
                <input
                  type="text"
                  value={sectionDialog.titleInput}
                  onChange={(event) => updateSectionDialog('titleInput', event.target.value)}
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr('dashboard.sectionFormColor')}</label>
                  <select
                    value={sectionDialog.lineColor}
                    onChange={(event) =>
                      updateSectionDialog('lineColor', normalizeSectionColor(event.target.value))
                    }
                    className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {SECTION_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr('dashboard.sectionFormStyle')}</label>
                  <select
                    value={sectionDialog.lineStyle}
                    onChange={(event) =>
                      updateSectionDialog('lineStyle', normalizeSectionStyle(event.target.value))
                    }
                    className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {SECTION_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr('dashboard.sectionFormWidth')}</label>
                  <select
                    value={sectionDialog.lineWidth}
                    onChange={(event) =>
                      updateSectionDialog(
                        'lineWidth',
                        normalizeSectionWidth(Number.parseInt(event.target.value, 10)),
                      )
                    }
                    className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {SECTION_LINE_WIDTHS.map((width) => (
                      <option key={width} value={width}>
                        {width}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr('dashboard.sectionFormAlign')}</label>
                  <select
                    value={sectionDialog.labelAlign}
                    onChange={(event) =>
                      updateSectionDialog('labelAlign', normalizeSectionAlignment(event.target.value))
                    }
                    className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="left">{tr('dashboard.sectionAlignLeft')}</option>
                    <option value="center">{tr('dashboard.sectionAlignCenter')}</option>
                    <option value="right">{tr('dashboard.sectionAlignRight')}</option>
                  </select>
                </div>
              </div>

              {sectionDialogError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
                  {sectionDialogError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button variant="ghost" data-sound="none" onClick={() => closeSectionDialog()}>
                {tr('common.cancel')}
              </Button>
              <Button data-sound="none" onClick={handleSubmitSectionDialog}>{tr('common.save')}</Button>
            </div>
          </div>
        </div>
      )}

      <CardHistoryDialog card={historyCard} onClose={closeHistoryDialog} />
      <DigestPreviewDialog card={digestPreviewCard} onClose={closeDigestPreviewDialog} />
    </div>
  );
};
