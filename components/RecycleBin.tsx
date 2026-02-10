import React from 'react';
import { useStore } from '../store';
import { Button } from './ui/Button';
import { RotateCcw, Trash, AlertTriangle } from 'lucide-react';

export const RecycleBin = () => {
  const { cards, restoreCard, hardDeleteCard } = useStore();
  const deletedCards = cards.filter(c => c.status.is_deleted);

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Recycle Bin</h1>
        <p className="text-muted-foreground">Manage deleted cards. Restore them to the dashboard or permanently delete them.</p>
      </div>

      {deletedCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl">
           <Trash size={48} className="text-muted-foreground mb-4" />
           <h3 className="text-lg font-medium text-muted-foreground">Bin is empty</h3>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
           <table className="w-full text-sm text-left">
             <thead className="bg-secondary/50 text-muted-foreground border-b border-border">
               <tr>
                 <th className="px-6 py-4 font-medium">Card Title</th>
                 <th className="px-6 py-4 font-medium">Original Group</th>
                 <th className="px-6 py-4 font-medium">Deleted At</th>
                 <th className="px-6 py-4 font-medium text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-border">
               {deletedCards.map(card => (
                 <tr key={card.id} className="hover:bg-secondary/20 transition-colors">
                   <td className="px-6 py-4 font-medium">{card.title}</td>
                   <td className="px-6 py-4">{card.group}</td>
                   <td className="px-6 py-4 text-muted-foreground">
                      {card.status.deleted_at ? new Date(card.status.deleted_at).toLocaleDateString() : '-'}
                   </td>
                   <td className="px-6 py-4 text-right space-x-2">
                     <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => restoreCard(card.id)}
                        className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-950/20"
                     >
                       <RotateCcw size={14} className="mr-1" /> Restore
                     </Button>
                     <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => hardDeleteCard(card.id)} 
                        className="text-destructive hover:text-red-400 hover:bg-red-950/20"
                     >
                       <Trash size={14} className="mr-1" /> Delete Forever
                     </Button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
           <div className="p-4 bg-secondary/20 border-t border-border flex items-center gap-2 text-amber-500 text-xs">
             <AlertTriangle size={14} />
             <span>Items deleted forever cannot be recovered.</span>
           </div>
        </div>
      )}
    </div>
  );
};
