import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ClipboardList,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { GroupBatchResult, useStore } from '../store';
import { Button } from './ui/Button';
import { t } from '../i18n';
import { interactionSoundService } from '../services/interaction-sound';

type CenterSectionId = 'create' | 'manage' | 'batch';
type BatchOperationType = 'move_group' | 'update_interval' | 'soft_delete';

interface CenterSectionMeta {
  id: CenterSectionId;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
}

interface DeleteDialogState {
  name: string;
  targetGroup: string;
  error: string;
}

const CENTER_SECTIONS: CenterSectionMeta[] = [
  {
    id: 'create',
    icon: FolderPlus,
    labelKey: 'groups.section.create',
    descriptionKey: 'groups.section.createDesc',
  },
  {
    id: 'manage',
    icon: Boxes,
    labelKey: 'groups.section.manage',
    descriptionKey: 'groups.section.manageDesc',
  },
  {
    id: 'batch',
    icon: ClipboardList,
    labelKey: 'groups.section.batch',
    descriptionKey: 'groups.section.batchDesc',
  },
];

const errorKeyMap: Record<string, string> = {
  empty: 'groups.error.empty',
  reserved: 'groups.error.reserved',
  duplicate: 'groups.error.duplicate',
  not_found: 'groups.error.notFound',
  target_required: 'groups.error.targetRequired',
  target_invalid: 'groups.error.targetInvalid',
  target_same: 'groups.error.targetSame',
  last_group: 'groups.error.lastGroup',
};

export const GroupManagementCenter: React.FC = () => {
  const {
    language,
    groups,
    cards,
    sectionMarkers,
    createGroup,
    renameGroup,
    reorderGroups,
    deleteGroup,
    executeGroupBatchAction,
  } = useStore();
  const tr = (key: string, params?: Record<string, string | number>) => t(language, key, params);

  const [activeSection, setActiveSection] = useState<CenterSectionId>('create');
  const [newGroupName, setNewGroupName] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);

  const [batchGroup, setBatchGroup] = useState('');
  const [batchOperation, setBatchOperation] = useState<BatchOperationType>('move_group');
  const [batchTargetGroup, setBatchTargetGroup] = useState('');
  const [batchIntervalInput, setBatchIntervalInput] = useState('300');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<GroupBatchResult | null>(null);

  const orderedGroups = useMemo(
    () =>
      groups
        .slice()
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.name.localeCompare(b.name);
        })
        .map((group) => group.name),
    [groups],
  );
  const groupMetaByName = useMemo(() => new Map(groups.map((group) => [group.name, group])), [groups]);

  const cardCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    cards
      .filter((card) => !card.status.is_deleted)
      .forEach((card) => {
        map.set(card.group, (map.get(card.group) ?? 0) + 1);
      });
    return map;
  }, [cards]);

  const markerCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    sectionMarkers.forEach((section) => {
      map.set(section.group, (map.get(section.group) ?? 0) + 1);
    });
    return map;
  }, [sectionMarkers]);

  useEffect(() => {
    if (!orderedGroups.includes(batchGroup)) {
      setBatchGroup(orderedGroups[0] ?? '');
    }
  }, [orderedGroups, batchGroup]);

  useEffect(() => {
    if (!batchGroup) return;
    if (!batchTargetGroup || batchTargetGroup === batchGroup || !orderedGroups.includes(batchTargetGroup)) {
      const fallback = orderedGroups.find((name) => name !== batchGroup) ?? '';
      setBatchTargetGroup(fallback);
    }
  }, [batchGroup, batchTargetGroup, orderedGroups]);

  useEffect(() => {
    setSelectedCardIds([]);
    setSelectedSectionIds([]);
    setBatchResult(null);
  }, [batchGroup, batchOperation]);

  const batchCards = useMemo(
    () => cards.filter((card) => !card.status.is_deleted && card.group === batchGroup),
    [cards, batchGroup],
  );

  const batchSections = useMemo(
    () => sectionMarkers.filter((section) => section.group === batchGroup),
    [sectionMarkers, batchGroup],
  );

  const activeSectionMeta =
    CENTER_SECTIONS.find((section) => section.id === activeSection) ?? CENTER_SECTIONS[0];
  const ActiveSectionIcon = activeSectionMeta.icon;

  const resolveErrorMessage = (error: string): string => tr(errorKeyMap[error] ?? 'groups.error.generic');

  const moveGroup = (name: string, direction: 'up' | 'down') => {
    const index = orderedGroups.indexOf(name);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedGroups.length) return;

    const next = orderedGroups.slice();
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    reorderGroups(next);
  };

  const handleCreateGroup = () => {
    setInlineError('');
    const result = createGroup(newGroupName);
    if ('error' in result) {
      interactionSoundService.play('action.error');
      setInlineError(resolveErrorMessage(result.error));
      return;
    }
    interactionSoundService.play('action.success');
    setNewGroupName('');
  };

  const startRename = (name: string) => {
    setInlineError('');
    setEditingName(name);
    setRenameInput(name);
  };

  const submitRename = () => {
    if (!editingName) return;
    const result = renameGroup(editingName, renameInput);
    if ('error' in result) {
      interactionSoundService.play('action.error');
      setInlineError(resolveErrorMessage(result.error));
      return;
    }
    interactionSoundService.play('action.success');
    setInlineError('');
    setEditingName(null);
    setRenameInput('');
  };

  const openDeleteDialog = (name: string) => {
    interactionSoundService.play('modal.open');
    const fallbackTarget = orderedGroups.find((groupName) => groupName !== name) ?? '';
    setDeleteDialog({
      name,
      targetGroup: fallbackTarget,
      error: '',
    });
  };

  const closeDeleteDialog = (playSound = true) => {
    if (playSound) interactionSoundService.play('modal.close');
    setDeleteDialog(null);
  };

  const submitDelete = () => {
    if (!deleteDialog) return;
    const targetGroup = deleteDialog.targetGroup.trim();
    const result = deleteGroup(deleteDialog.name, targetGroup || undefined);
    if ('error' in result) {
      interactionSoundService.play('action.error');
      setDeleteDialog((prev) =>
        prev
          ? {
              ...prev,
              error: resolveErrorMessage(result.error),
            }
          : prev,
      );
      return;
    }
    interactionSoundService.play('action.destructive');
    closeDeleteDialog(false);
    setInlineError('');
  };

  const toggleSelection = (ids: string[], setter: (next: string[]) => void, id: string) => {
    if (ids.includes(id)) {
      setter(ids.filter((value) => value !== id));
      return;
    }
    setter([...ids, id]);
  };

  const handleSubmitBatch = () => {
    if (!batchGroup) return;

    if (batchOperation === 'move_group') {
      const result = executeGroupBatchAction({
        type: 'move_group',
        sourceGroup: batchGroup,
        targetGroup: batchTargetGroup,
        cardIds: selectedCardIds,
        sectionIds: selectedSectionIds,
      });
      setBatchResult(result);
      setSelectedCardIds([]);
      setSelectedSectionIds([]);
      if (result.failures.length > 0) {
        interactionSoundService.play('action.error');
      } else if (result.successCards + result.successSections > 0) {
        interactionSoundService.play('action.success');
      }
      return;
    }

    if (batchOperation === 'update_interval') {
      const intervalSec = Number.parseInt(batchIntervalInput.trim(), 10);
      const result = executeGroupBatchAction({
        type: 'update_interval',
        sourceGroup: batchGroup,
        intervalSec,
        cardIds: selectedCardIds,
        sectionIds: selectedSectionIds,
      });
      setBatchResult(result);
      setSelectedCardIds([]);
      setSelectedSectionIds([]);
      if (result.failures.length > 0) {
        interactionSoundService.play('action.error');
      } else if (result.successCards + result.successSections > 0) {
        interactionSoundService.play('action.success');
      }
      return;
    }

    const result = executeGroupBatchAction({
      type: 'soft_delete',
      sourceGroup: batchGroup,
      cardIds: selectedCardIds,
      sectionIds: selectedSectionIds,
    });
    setBatchResult(result);
    setSelectedCardIds([]);
    setSelectedSectionIds([]);
    if (result.failures.length > 0) {
      interactionSoundService.play('action.error');
    } else if (result.successCards + result.successSections > 0) {
      interactionSoundService.play('action.destructive');
    }
  };

  const hasAllCardsSelected = batchCards.length > 0 && selectedCardIds.length === batchCards.length;
  const hasAllSectionsSelected = batchSections.length > 0 && selectedSectionIds.length === batchSections.length;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{tr('groups.title')}</h1>
        <p className="text-muted-foreground">{tr('groups.subtitle')}</p>
      </div>

      <div className="lg:hidden mb-4 overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          {CENTER_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                data-sound="nav.switch"
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 text-foreground'
                    : 'border-border/80 bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
              >
                <Icon size={15} className={isActive ? 'text-primary' : ''} />
                <span className="whitespace-nowrap">{tr(section.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-6">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tr('groups.category')}
            </p>
            <nav className="space-y-1" aria-label={tr('groups.category')}>
              {CENTER_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    data-sound="nav.switch"
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      isActive
                        ? 'border-primary/35 bg-primary/10 text-foreground shadow-sm'
                        : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-secondary/60 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={16} className={`mt-0.5 ${isActive ? 'text-primary' : ''}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{tr(section.labelKey)}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {tr(section.descriptionKey)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg border border-primary/25 bg-primary/10 flex items-center justify-center text-primary">
                <ActiveSectionIcon size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{tr(activeSectionMeta.labelKey)}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tr(activeSectionMeta.descriptionKey)}</p>
              </div>
            </div>
          </div>

          {activeSection === 'create' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
              <div className="text-sm font-medium">{tr('groups.createTitle')}</div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={tr('groups.createPlaceholder')}
                />
                <Button data-sound="none" onClick={handleCreateGroup}>
                  <Plus size={16} className="mr-2" /> {tr('groups.createAction')}
                </Button>
              </div>
              {inlineError && <p className="text-sm text-destructive">{inlineError}</p>}
            </div>
          )}

          {activeSection === 'manage' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="text-sm font-medium mb-3">{tr('groups.listTitle')}</div>
              {inlineError && <p className="text-sm text-destructive mb-3">{inlineError}</p>}

              {orderedGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">{tr('groups.empty')}</div>
              ) : (
                <div className="space-y-2">
                  {orderedGroups.map((name, index) => {
                    const cardCount = cardCountByGroup.get(name) ?? 0;
                    const markerCount = markerCountByGroup.get(name) ?? 0;
                    const editing = editingName === name;

                    return (
                      <div
                        key={name}
                        className="rounded-lg border border-border bg-background/60 px-3 py-2 flex flex-col md:flex-row md:items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          {editing ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={renameInput}
                                onChange={(event) => setRenameInput(event.target.value)}
                                className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <Button size="sm" data-sound="none" onClick={submitRename}>
                                {tr('groups.renameSave')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingName(null);
                                  setRenameInput('');
                                }}
                              >
                                {tr('common.cancel')}
                              </Button>
                            </div>
                          ) : (
                            <div className="min-w-0">
                              <div className="font-medium truncate">{name}</div>
                              <div className="text-[11px] text-muted-foreground/90 mt-0.5">
                                {tr('groups.groupId', { id: groupMetaByName.get(name)?.id ?? '-' })}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {tr('groups.summary', { cards: cardCount, sections: markerCount })}
                              </div>
                            </div>
                          )}
                        </div>

                        {!editing && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => moveGroup(name, 'up')}
                              disabled={index === 0}
                              title={tr('groups.sortUp')}
                            >
                              <ArrowUp size={14} />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => moveGroup(name, 'down')}
                              disabled={index === orderedGroups.length - 1}
                              title={tr('groups.sortDown')}
                            >
                              <ArrowDown size={14} />
                            </Button>
                            <Button size="icon" variant="outline" onClick={() => startRename(name)} title={tr('groups.renameAction')}>
                              <Pencil size={14} />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              data-sound="none"
                              onClick={() => openDeleteDialog(name)}
                              title={tr('groups.deleteAction')}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSection === 'batch' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tr('groups.batch.sourceGroup')}</label>
                  <select
                    value={batchGroup}
                    onChange={(event) => setBatchGroup(event.target.value)}
                    className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {orderedGroups.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tr('groups.batch.operation')}</label>
                  <div className="flex flex-wrap gap-2">
                    {(['move_group', 'update_interval', 'soft_delete'] as BatchOperationType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setBatchOperation(type)}
                        className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                          batchOperation === type
                            ? 'border-primary/35 bg-primary/10 text-foreground'
                            : 'border-border/80 bg-secondary/30 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tr(`groups.batch.op.${type}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{tr('groups.batch.cards')}</p>
                    <label className="text-xs text-muted-foreground inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasAllCardsSelected}
                        onChange={(event) =>
                          setSelectedCardIds(event.target.checked ? batchCards.map((card) => card.id) : [])
                        }
                      />
                      {tr('groups.batch.selectAll')}
                    </label>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                    {batchCards.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{tr('groups.batch.emptyCards')}</p>
                    ) : (
                      batchCards.map((card) => (
                        <label key={card.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCardIds.includes(card.id)}
                            onChange={() => toggleSelection(selectedCardIds, setSelectedCardIds, card.id)}
                          />
                          <span className="truncate">
                            {card.title}
                            <span className="ml-2 text-xs text-muted-foreground">
                              [{card.type}] {tr('groups.cardId', { id: card.business_id ?? '-' })}
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{tr('groups.batch.sections')}</p>
                    <label className="text-xs text-muted-foreground inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasAllSectionsSelected}
                        onChange={(event) =>
                          setSelectedSectionIds(event.target.checked ? batchSections.map((section) => section.id) : [])
                        }
                      />
                      {tr('groups.batch.selectAll')}
                    </label>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                    {batchSections.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{tr('groups.batch.emptySections')}</p>
                    ) : (
                      batchSections.map((section) => (
                        <label key={section.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedSectionIds.includes(section.id)}
                            onChange={() => toggleSelection(selectedSectionIds, setSelectedSectionIds, section.id)}
                          />
                          <span className="truncate">{section.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {batchOperation === 'move_group' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tr('groups.batch.targetGroup')}</label>
                  <select
                    value={batchTargetGroup}
                    onChange={(event) => setBatchTargetGroup(event.target.value)}
                    className="w-full md:w-64 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">{tr('groups.batch.targetGroupPlaceholder')}</option>
                    {orderedGroups
                      .filter((name) => name !== batchGroup)
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {batchOperation === 'update_interval' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tr('groups.batch.intervalSec')}</label>
                  <input
                    type="number"
                    min={0}
                    value={batchIntervalInput}
                    onChange={(event) => setBatchIntervalInput(event.target.value)}
                    className="w-full md:w-64 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {batchOperation === 'soft_delete' && (
                <p className="text-sm text-muted-foreground">{tr('groups.batch.softDeleteHint')}</p>
              )}

              <div className="flex items-center justify-end">
                <Button data-sound="none" onClick={handleSubmitBatch}>{tr('groups.batch.execute')}</Button>
              </div>

              {batchResult && (
                <div className="rounded-lg border border-border/70 bg-secondary/20 p-3 space-y-2">
                  <p className="text-sm font-medium">
                    {tr('groups.batch.resultSummary', {
                      cards: batchResult.successCards,
                      sections: batchResult.successSections,
                      failed: batchResult.failures.length,
                    })}
                  </p>
                  {batchResult.failures.length > 0 && (
                    <div className="space-y-1">
                      {batchResult.failures.slice(0, 12).map((failure, index) => (
                        <p key={`${failure.entity}-${failure.id}-${index}`} className="text-xs text-muted-foreground">
                          {tr('groups.batch.resultFailure', {
                            entity: tr(`groups.batch.entity.${failure.entity}`),
                            id: failure.id || '-',
                            reason: tr(`groups.batch.reason.${failure.reason}`),
                          })}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {deleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{tr('groups.deleteTitle')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {tr('groups.deleteDescription', { name: deleteDialog.name })}
                </p>
              </div>
              <button
                type="button"
                data-sound="none"
                onClick={() => closeDeleteDialog()}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {(cardCountByGroup.get(deleteDialog.name) ?? 0) + (markerCountByGroup.get(deleteDialog.name) ?? 0) > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('groups.deleteTargetLabel')}</label>
                <select
                  value={deleteDialog.targetGroup}
                  onChange={(event) =>
                    setDeleteDialog((prev) =>
                      prev
                        ? {
                            ...prev,
                            targetGroup: event.target.value,
                            error: '',
                          }
                        : prev,
                    )
                  }
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">{tr('groups.deleteTargetPlaceholder')}</option>
                  {orderedGroups
                    .filter((name) => name !== deleteDialog.name)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {tr('groups.deleteImpact', {
                    cards: cardCountByGroup.get(deleteDialog.name) ?? 0,
                    sections: markerCountByGroup.get(deleteDialog.name) ?? 0,
                  })}
                </p>
              </div>
            )}

            {deleteDialog.error && <p className="text-sm text-destructive">{deleteDialog.error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" data-sound="none" onClick={() => closeDeleteDialog()}>
                {tr('common.cancel')}
              </Button>
              <Button variant="destructive" data-sound="none" onClick={submitDelete}>
                {tr('groups.deleteConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
