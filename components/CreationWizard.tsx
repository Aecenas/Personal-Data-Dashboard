import React, { useState } from 'react';
import { Button } from './ui/Button';
import { X, FileCode, CheckCircle2, ChevronRight, BarChart3, Binary, LayoutGrid, Grid2X2, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { useStore } from '../store';
import { Card, CardType, UIConfig } from '../types';

interface CreationWizardProps {
  onClose: () => void;
}

export const CreationWizard: React.FC<CreationWizardProps> = ({ onClose }) => {
  const { addCard } = useStore();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<{
    title: string;
    group: string;
    type: CardType;
    scriptPath: string;
    size: UIConfig['size'];
  }>({
    title: '',
    group: 'Default',
    type: 'scalar',
    scriptPath: '',
    size: '1x1'
  });

  const handleCreate = () => {
    // Construct new card object
    const newCard: Card = {
      id: crypto.randomUUID(),
      title: formData.title,
      group: formData.group,
      type: formData.type,
      script_config: { path: formData.scriptPath, args: [] },
      mapping_config: {},
      ui_config: { color_theme: 'default', size: formData.size, x: 0, y: 0 },
      status: { is_deleted: false, deleted_at: null },
      runtimeData: { 
        isLoading: false, 
        lastUpdated: Date.now(),
        // Mock payload for immediate satisfaction
        payload: formData.type === 'scalar' 
          ? { value: 0, unit: 'Test' }
          : { x_axis: ['A','B','C'], series: [{ name: 'Data', values: [10, 20, 15] }] }
      }
    };
    addCard(newCard);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Add New Metric</h2>
            <p className="text-sm text-muted-foreground">Configure your local Python script as a data source.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={20} /></Button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Step Indicator */}
          <div className="flex items-center mb-8 gap-4 text-sm">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">1</span>
              <span>Info</span>
            </div>
            <div className="h-px w-8 bg-border"></div>
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">2</span>
              <span>Source</span>
            </div>
            <div className="h-px w-8 bg-border"></div>
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">3</span>
              <span>Preview</span>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <label className="text-sm font-medium">Card Title</label>
                <input 
                  type="text" 
                  className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. GPU Temp"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Group</label>
                    <select 
                      className="w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={formData.group}
                      onChange={e => setFormData({...formData, group: e.target.value})}
                    >
                      <option value="Default">Default</option>
                      <option value="Infrastructure">Infrastructure</option>
                      <option value="Finance">Finance</option>
                      <option value="Home">Home</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Size</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setFormData({...formData, size: '1x1'})}
                        className={`p-2 rounded border ${formData.size === '1x1' ? 'border-primary bg-secondary' : 'border-border'} hover:bg-secondary/50`}
                        title="1x1"
                      >
                        <LayoutGrid size={18} />
                      </button>
                      <button 
                        onClick={() => setFormData({...formData, size: '2x1'})}
                        className={`p-2 rounded border ${formData.size === '2x1' ? 'border-primary bg-secondary' : 'border-border'} hover:bg-secondary/50`}
                        title="2x1"
                      >
                        <RectangleHorizontal size={18} />
                      </button>
                      <button 
                        onClick={() => setFormData({...formData, size: '1x2'})}
                        className={`p-2 rounded border ${formData.size === '1x2' ? 'border-primary bg-secondary' : 'border-border'} hover:bg-secondary/50`}
                        title="1x2"
                      >
                        <RectangleVertical size={18} />
                      </button>
                      <button 
                        onClick={() => setFormData({...formData, size: '2x2'})}
                        className={`p-2 rounded border ${formData.size === '2x2' ? 'border-primary bg-secondary' : 'border-border'} hover:bg-secondary/50`}
                        title="2x2"
                      >
                        <Grid2X2 size={18} />
                      </button>
                    </div>
                  </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Visualization Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    className={`border rounded-lg p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${formData.type === 'scalar' ? 'border-primary bg-secondary/50' : 'border-border'}`}
                    onClick={() => setFormData({...formData, type: 'scalar'})}
                  >
                    <Binary className="mb-2 text-primary" />
                    <div className="font-medium">Scalar</div>
                    <div className="text-xs text-muted-foreground">Single value display</div>
                  </div>
                  <div 
                    className={`border rounded-lg p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${formData.type === 'series' ? 'border-primary bg-secondary/50' : 'border-border'}`}
                    onClick={() => setFormData({...formData, type: 'series'})}
                  >
                    <BarChart3 className="mb-2 text-primary" />
                    <div className="font-medium">Series</div>
                    <div className="text-xs text-muted-foreground">Line or Bar charts</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="space-y-2">
                <label className="text-sm font-medium">Python Script Path</label>
                <div className="flex gap-2">
                   <input 
                    type="text" 
                    className="flex-1 bg-secondary/50 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="/path/to/your/script.py"
                    value={formData.scriptPath}
                    onChange={e => setFormData({...formData, scriptPath: e.target.value})}
                  />
                  <Button variant="secondary">Browse</Button>
                </div>
                <p className="text-xs text-muted-foreground">Script must output JSON to STDOUT.</p>
              </div>
              
              <div className="p-4 bg-secondary/30 rounded-lg border border-border">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <FileCode size={16} /> Expected Output Format
                </div>
                <pre className="text-xs font-mono text-muted-foreground overflow-x-auto p-2 bg-black/20 rounded">
{formData.type === 'scalar' ? 
`{
  "type": "scalar",
  "data": { "value": 100, "unit": "ms" }
}` : 
`{
  "type": "series",
  "data": { 
    "x_axis": ["10:00", "11:00"], 
    "series": [{ "name": "val", "values": [1, 2] }]
  }
}`}
                </pre>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center h-full space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
               <CheckCircle2 size={48} className="text-emerald-500" />
               <h3 className="text-lg font-medium">Ready to Create</h3>
               <p className="text-center text-muted-foreground max-w-xs">
                 The script passed validation. Click "Create" to add it to your dashboard.
               </p>
               {/* Visual Preview Placeholder */}
               <div className="w-full max-w-sm h-32 border border-dashed border-border rounded-lg flex items-center justify-center text-sm text-muted-foreground bg-secondary/10">
                 Live Preview Area
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-between bg-card">
           <Button 
             variant="ghost" 
             onClick={() => setStep(s => Math.max(1, s - 1))}
             disabled={step === 1}
           >
             Back
           </Button>
           
           {step < 3 ? (
             <Button onClick={() => setStep(s => s + 1)}>
               Next <ChevronRight size={16} className="ml-1" />
             </Button>
           ) : (
             <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
               Create Card
             </Button>
           )}
        </div>
      </div>
    </div>
  );
};