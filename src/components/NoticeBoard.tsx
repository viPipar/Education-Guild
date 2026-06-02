import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/supabase';
import { 
  X, Plus, Type, Undo2, Redo2, Trash2, Hand, MousePointer, Pencil, Eraser
} from 'lucide-react';
import { playClick, playSelect } from '../lib/audio';

export interface BoardElement {
  id: string;
  type: 'text' | 'sticky';
  text: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  color?: string; // background color for sticky notes
  isBold?: boolean;
  isItalic?: boolean;
  fontSize?: number; // 12, 16, 20, 24, 32
}

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

interface NoticeBoardProps {
  roomId: string;
  onClose: () => void;
}

export const NoticeBoard: React.FC<NoticeBoardProps> = ({ roomId, onClose }) => {
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<'select' | 'pen' | 'eraser' | 'pan'>('select');
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  
  // Brush styling
  const [brushColor, setBrushColor] = useState('#ffc6ff');
  const [brushWidth, setBrushWidth] = useState(4);

  // Undo/Redo stacks
  const [history, setHistory] = useState<{ elements: BoardElement[]; strokes: WhiteboardStroke[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Drag and Drop (Select Tool)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });

  // Panning (Hand Tool)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Freehand Drawing (Pen/Eraser Tool)
  const [isDrawing, setIsDrawing] = useState(false);
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null);

  // Ref hooks
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceWidth = 2000;
  const workspaceHeight = 1125;

  // Load initial board data
  const loadBoardData = async () => {
    const w = await db.getWhiteboard(roomId);
    const loadedElements = (w.notes as unknown as BoardElement[]) || [];
    const loadedStrokes = (w.strokes as unknown as WhiteboardStroke[]) || [];
    
    setElements(loadedElements);
    setStrokes(loadedStrokes);
    
    const initialState = { elements: loadedElements, strokes: loadedStrokes };
    setHistory([initialState]);
    setHistoryIndex(0);
  };

  useEffect(() => {
    loadBoardData();

    // Subscribe to realtime database broadcast channels
    const unsubscribe = db.subscribe((msg) => {
      if (msg.type === 'whiteboard_update' && msg.payload.roomId === roomId) {
        const remoteElements = (msg.payload.notes as unknown as BoardElement[]) || [];
        const remoteStrokes = (msg.payload.strokes as unknown as WhiteboardStroke[]) || [];
        
        setElements(remoteElements);
        setStrokes(remoteStrokes);
        
        // Sync history stacks
        setHistory(prev => {
          const cut = prev.slice(0, historyIndex + 1);
          return [...cut, { elements: remoteElements, strokes: remoteStrokes }];
        });
        setHistoryIndex(prev => prev + 1);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Redraw freehand canvas strokes whenever strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, workspaceWidth, workspaceHeight);
    
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      ctx.beginPath();
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#15121b' : stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Transparent eraser mode in canvas overlay
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      let i;
      for (i = 1; i < stroke.points.length - 1; i++) {
        const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
      }
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      ctx.stroke();
    });

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }, [strokes]);

  // Keyboard shortcut listener (Ctrl+Z and Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (isTyping) return;
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        if (isTyping) return;
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex]);

  // Handle pinch/ctrl+wheel zoom on the board container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelEvent = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomStep = 0.1;
        if (e.deltaY < 0) {
          setZoomScale(prev => Math.min(2.0, Math.round((prev + zoomStep) * 10) / 10));
        } else {
          setZoomScale(prev => Math.max(0.5, Math.round((prev - zoomStep) * 10) / 10));
        }
      }
    };

    container.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);

  // Save changes to Supabase Whiteboard and local history
  const saveState = async (newElements: BoardElement[], newStrokes: WhiteboardStroke[], pushToHistory = true) => {
    setElements(newElements);
    setStrokes(newStrokes);
    await db.saveWhiteboard(roomId, newStrokes as any, newElements as any);

    if (pushToHistory) {
      const updatedHistory = history.slice(0, historyIndex + 1);
      setHistory([...updatedHistory, { elements: newElements, strokes: newStrokes }]);
      setHistoryIndex(updatedHistory.length);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      playClick();
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prev = history[prevIndex];
      setElements(prev.elements);
      setStrokes(prev.strokes);
      db.saveWhiteboard(roomId, prev.strokes as any, prev.elements as any);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      playClick();
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const next = history[nextIndex];
      setElements(next.elements);
      setStrokes(next.strokes);
      db.saveWhiteboard(roomId, next.strokes as any, next.elements as any);
    }
  };

  // Canvas Mouse Interactions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode === 'select' || editingId) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    // Translate mouse coordinates to absolute canvas pixel values (2000x1125)
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const x = (clientX / rect.width) * workspaceWidth;
    const y = (clientY / rect.height) * workspaceHeight;

    if (drawMode === 'pan') {
      setIsPanning(true);
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        scrollLeft: containerRef.current!.scrollLeft,
        scrollTop: containerRef.current!.scrollTop
      });
      return;
    }

    if (drawMode === 'pen' || drawMode === 'eraser') {
      setIsDrawing(true);
      const newStroke: WhiteboardStroke = {
        id: 'stroke_' + Date.now(),
        tool: drawMode === 'eraser' ? 'eraser' : 'pen',
        color: brushColor,
        width: drawMode === 'eraser' ? 25 : brushWidth,
        points: [{ x, y }]
      };
      activeStrokeRef.current = newStroke;
      setStrokes(prev => [...prev, newStroke]);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const x = (clientX / rect.width) * workspaceWidth;
    const y = (clientY / rect.height) * workspaceHeight;

    if (drawMode === 'pan' && isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      containerRef.current!.scrollLeft = panStart.scrollLeft - dx;
      containerRef.current!.scrollTop = panStart.scrollTop - dy;
      return;
    }

    if ((drawMode === 'pen' || drawMode === 'eraser') && isDrawing && activeStrokeRef.current) {
      const stroke = activeStrokeRef.current;
      stroke.points.push({ x, y });
      setStrokes(prev => prev.map(s => s.id === stroke.id ? { ...s, points: [...stroke.points] } : s));
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawing && activeStrokeRef.current) {
      setIsDrawing(false);
      saveState(elements, strokes, true);
      activeStrokeRef.current = null;
    }
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // Add Elements (Text, Sticky Note)
  const handleAddSticky = () => {
    playSelect();
    const colors = ['#fffd82', '#ffc6ff', '#9bf6ff', '#caffbf', '#fdffb6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Position center relative to scroll container view
    const scrollLeft = containerRef.current ? containerRef.current.scrollLeft : 0;
    const scrollTop = containerRef.current ? containerRef.current.scrollTop : 0;
    const viewportWidth = containerRef.current ? containerRef.current.clientWidth : 800;
    const viewportHeight = containerRef.current ? containerRef.current.clientHeight : 450;
    
    const centerXPx = scrollLeft + viewportWidth / 2;
    const centerYPx = scrollTop + viewportHeight / 2;
    
    const xPct = Math.min(90, Math.max(5, (centerXPx / workspaceWidth) * 100));
    const yPct = Math.min(90, Math.max(5, (centerYPx / workspaceHeight) * 100));

    const newElement: BoardElement = {
      id: 'sticky_' + Date.now(),
      type: 'sticky',
      text: 'Klik 2x untuk menulis...',
      x: xPct,
      y: yPct,
      color: randomColor,
      isBold: false,
      isItalic: false,
      fontSize: 16
    };
    
    const updated = [...elements, newElement];
    saveState(updated, strokes);
    setSelectedId(newElement.id);
  };

  const handleAddText = () => {
    playSelect();
    const scrollLeft = containerRef.current ? containerRef.current.scrollLeft : 0;
    const scrollTop = containerRef.current ? containerRef.current.scrollTop : 0;
    const viewportWidth = containerRef.current ? containerRef.current.clientWidth : 800;
    const viewportHeight = containerRef.current ? containerRef.current.clientHeight : 450;
    
    const centerXPx = scrollLeft + viewportWidth / 2;
    const centerYPx = scrollTop + viewportHeight / 2;
    
    const xPct = Math.min(90, Math.max(5, (centerXPx / workspaceWidth) * 100));
    const yPct = Math.min(90, Math.max(5, (centerYPx / workspaceHeight) * 100));

    const newElement: BoardElement = {
      id: 'text_' + Date.now(),
      type: 'text',
      text: 'Klik 2x untuk menulis...',
      x: xPct,
      y: yPct,
      isBold: false,
      isItalic: false,
      fontSize: 16
    };
    
    const updated = [...elements, newElement];
    saveState(updated, strokes);
    setSelectedId(newElement.id);
  };

  const handleDeleteElement = (id: string) => {
    playClick();
    const updated = elements.filter(el => el.id !== id);
    saveState(updated, strokes);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
  };

  const handleClearDrawings = () => {
    playClick();
    saveState(elements, []);
  };

  const updateElementProps = (id: string, updates: Partial<BoardElement>, pushHistory = false) => {
    const updated = elements.map(el => {
      if (el.id === id) {
        return { ...el, ...updates };
      }
      return el;
    });
    // If not final push, just update local state to avoid typing lag, save to DB onBlur
    if (pushHistory) {
      saveState(updated, strokes, true);
    } else {
      setElements(updated);
    }
  };

  // Element Mouse Drag-and-Drop (only when select mode active)
  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    if (drawMode !== 'select' || editingId) return;
    
    playClick();
    setSelectedId(id);
    setDraggingId(id);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    const element = elements.find(el => el.id === id);
    if (!element) return;

    const elXpx = (element.x / 100) * rect.width;
    const elYpx = (element.y / 100) * rect.height;

    // Mouse coordinate relative to canvas wrapper
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDragStartPos({
      x: mouseX - elXpx,
      y: mouseY - elYpx
    });
    
    e.stopPropagation();
  };

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || drawMode !== 'select' || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let newXPx = mouseX - dragStartPos.x;
    let newYPx = mouseY - dragStartPos.y;

    const xPct = Math.min(95, Math.max(0, (newXPx / rect.width) * 100));
    const yPct = Math.min(95, Math.max(0, (newYPx / rect.height) * 100));

    setElements(prev => prev.map(el => {
      if (el.id === draggingId) {
        return { ...el, x: xPct, y: yPct };
      }
      return el;
    }));
  };

  const handleWorkspaceMouseUp = () => {
    if (draggingId) {
      saveState(elements, strokes, true);
      setDraggingId(null);
    }
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-4">
      <div className="rpg-panel-glass max-w-6xl w-full flex flex-col h-[90vh]">
        
        {/* Whiteboard Header Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-center border-b border-amber-600/20 pb-3 mb-3 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-500 font-bold text-xs uppercase tracking-wide rpg-font-retro pr-2">
              Notice Board
            </span>
            
            {/* Draw mode selectors */}
            <div className="flex bg-slate-950 p-1 border border-slate-800 rounded">
              <button 
                onClick={() => { playSelect(); setDrawMode('select'); setEditingId(null); }}
                className={`p-1.5 rounded transition-colors ${drawMode === 'select' ? 'bg-amber-600 text-stone-950' : 'text-slate-400 hover:text-white'}`}
                title="Select & Move (V)"
              >
                <MousePointer size={13} />
              </button>
              <button 
                onClick={() => { playSelect(); setDrawMode('pan'); setEditingId(null); }}
                className={`p-1.5 rounded transition-colors ${drawMode === 'pan' ? 'bg-amber-600 text-stone-950' : 'text-slate-400 hover:text-white'}`}
                title="Pan View (H)"
              >
                <Hand size={13} />
              </button>
              <button 
                onClick={() => { playSelect(); setDrawMode('pen'); setEditingId(null); }}
                className={`p-1.5 rounded transition-colors ${drawMode === 'pen' ? 'bg-amber-600 text-stone-950' : 'text-slate-400 hover:text-white'}`}
                title="Pen Coretan (P)"
              >
                <Pencil size={13} />
              </button>
              <button 
                onClick={() => { playSelect(); setDrawMode('eraser'); setEditingId(null); }}
                className={`p-1.5 rounded transition-colors ${drawMode === 'eraser' ? 'bg-amber-600 text-stone-950' : 'text-slate-400 hover:text-white'}`}
                title="Penghapus Coretan (E)"
              >
                <Eraser size={13} />
              </button>
            </div>

            {/* Brush styling selectors (active when pen/eraser) */}
            {(drawMode === 'pen' || drawMode === 'eraser') && (
              <div className="flex items-center gap-2 bg-slate-950 p-1 border border-slate-800 rounded text-[9px] font-bold">
                {drawMode === 'pen' && (
                  <div className="flex gap-1">
                    {['#fffd82', '#ffc6ff', '#9bf6ff', '#caffbf', '#ff6b6b', '#ffffff'].map(color => (
                      <button
                        key={color}
                        onClick={() => setBrushColor(color)}
                        style={{ backgroundColor: color }}
                        className={`w-3.5 h-3.5 rounded-full border ${brushColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1 pl-1">
                  <span className="text-slate-400 text-[8px]">UKURAN:</span>
                  <input
                    type="range"
                    min={2}
                    max={18}
                    value={brushWidth}
                    onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                    className="w-16 accent-amber-500 h-1"
                  />
                  <span className="text-yellow-100 font-mono text-[8px]">{brushWidth}px</span>
                </div>
              </div>
            )}

            {/* Elements creator buttons */}
            <div className="flex gap-1 border-l border-slate-800 pl-2">
              <button 
                onClick={handleAddSticky} 
                className="bg-slate-900 border border-amber-500/30 hover:border-amber-500 text-yellow-50 px-2.5 py-1 rounded text-[10px] flex items-center gap-1 font-bold"
              >
                <Plus size={10} /> Sticky Note
              </button>
              <button 
                onClick={handleAddText} 
                className="bg-slate-900 border border-amber-500/30 hover:border-amber-500 text-yellow-50 px-2.5 py-1 rounded text-[10px] flex items-center gap-1 font-bold"
              >
                <Type size={10} /> Text
              </button>
            </div>
            
            {/* Undo/Redo */}
            <div className="flex gap-1 border-l border-slate-800 pl-2">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="p-1.5 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={12} />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="p-1.5 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 size={12} />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border-l border-slate-800 pl-2 text-[10px] font-bold">
              <button
                onClick={() => {
                  playSelect();
                  setZoomScale(prev => Math.max(0.5, Math.round((prev - 0.1) * 10) / 10));
                }}
                disabled={zoomScale <= 0.5}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 w-6 h-6 flex items-center justify-center font-bold"
                title="Zoom Out (-)"
              >
                -
              </button>
              <span className="text-yellow-100 font-mono w-10 text-center select-none">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => {
                  playSelect();
                  setZoomScale(prev => Math.min(2.0, Math.round((prev + 0.1) * 10) / 10));
                }}
                disabled={zoomScale >= 2.0}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 w-6 h-6 flex items-center justify-center font-bold"
                title="Zoom In (+)"
              >
                +
              </button>
              <button
                onClick={() => {
                  playSelect();
                  setZoomScale(1.0);
                }}
                disabled={zoomScale === 1.0}
                className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 text-[8px]"
                title="Reset Zoom (100%)"
              >
                100%
              </button>
            </div>

            {/* Clear drawings button */}
            {strokes.length > 0 && (
              <button
                onClick={handleClearDrawings}
                className="bg-red-950/40 hover:bg-red-900/60 border border-red-900/30 text-red-300 px-2 py-1 rounded text-[9px] flex items-center gap-1 font-bold"
                title="Clear only drawings"
              >
                <Trash2 size={10} /> Coretan
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Workspace Layout */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
          
          {/* Scrollable Main Board Canvas Container */}
          <div 
            ref={containerRef}
            onMouseMove={handleWorkspaceMouseMove}
            onMouseUp={handleWorkspaceMouseUp}
            className="flex-1 bg-[#15121b] border-2 border-slate-800 rounded overflow-auto relative cursor-default select-none"
            onClick={() => {
              if (drawMode === 'select') {
                setSelectedId(null);
                setEditingId(null);
              }
            }}
          >
            {/* Outer Wrapper to trigger correct scrollbar behavior */}
            <div
              style={{
                width: `${workspaceWidth * zoomScale}px`,
                height: `${workspaceHeight * zoomScale}px`,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* The giant 2000x1125 whiteboard canvas (Inner scaled element) */}
              <div 
                className="relative shadow-inner"
                style={{
                  width: `${workspaceWidth}px`,
                  height: `${workspaceHeight}px`,
                  backgroundImage: 'radial-gradient(rgba(204, 165, 102, 0.12) 1.5px, transparent 1.5px)',
                  backgroundSize: '24px 24px',
                  cursor: drawMode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default',
                  transform: `scale(${zoomScale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  left: 0,
                  top: 0
                }}
              >
                
                {/* HTML5 Canvas overlay for drawings */}
                <canvas
                  ref={canvasRef}
                  width={workspaceWidth}
                  height={workspaceHeight}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className="absolute inset-0 z-0 pointer-events-auto"
                />

                {/* Elements loop */}
                {elements.map(el => {
                  const isSelected = el.id === selectedId;
                  const isEditing = el.id === editingId;
                  const isSticky = el.type === 'sticky';
                  
                  const typoStyle: React.CSSProperties = {
                    fontWeight: el.isBold ? 'bold' : 'normal',
                    fontStyle: el.isItalic ? 'italic' : 'normal',
                    fontSize: `${el.fontSize || 16}px`
                  };

                  if (isSticky) {
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingId(el.id);
                          setSelectedId(el.id);
                        }}
                        style={{
                          left: `${el.x}%`,
                          top: `${el.y}%`,
                          backgroundColor: el.color || '#fffd82',
                          ...typoStyle
                        }}
                        className={`absolute w-36 min-h-[90px] p-2.5 shadow-2xl rounded text-slate-900 flex flex-col justify-between cursor-grab select-none z-10 border-2 ${
                          isSelected ? 'border-amber-500 scale-105 shadow-yellow-500/20' : 'border-slate-800/10'
                        }`}
                      >
                        {isEditing ? (
                          <textarea
                            autoFocus
                            value={el.text}
                            onChange={(e) => updateElementProps(el.id, { text: e.target.value }, false)}
                            onBlur={() => updateElementProps(el.id, {}, true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                updateElementProps(el.id, {}, true);
                                setEditingId(null);
                              }
                            }}
                            className="w-full h-full bg-black/10 border-none outline-none resize-none p-0 text-slate-950 font-mono font-bold text-xs"
                            style={{ minHeight: '60px' }}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap leading-tight break-words pr-1 flex-1 font-mono text-[10px]">
                            {el.text}
                          </p>
                        )}
                        <span className="text-[6px] text-slate-600 block mt-1 font-sans font-bold select-none">STICKY</span>
                      </div>
                    );
                  } else {
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingId(el.id);
                          setSelectedId(el.id);
                        }}
                        style={{
                          left: `${el.x}%`,
                          top: `${el.y}%`,
                          color: '#fff',
                          ...typoStyle
                        }}
                        className={`absolute p-1.5 cursor-grab select-none z-10 border rounded bg-slate-950/20 whitespace-pre-wrap break-words max-w-[200px] ${
                          isSelected ? 'border-amber-500 bg-slate-950/60 scale-105' : 'border-transparent hover:border-slate-700/50'
                        }`}
                      >
                        {isEditing ? (
                          <textarea
                            autoFocus
                            value={el.text}
                            onChange={(e) => updateElementProps(el.id, { text: e.target.value }, false)}
                            onBlur={() => updateElementProps(el.id, {}, true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                updateElementProps(el.id, {}, true);
                                setEditingId(null);
                              }
                            }}
                            className="w-full bg-slate-900 text-yellow-100 border border-slate-700 outline-none p-1 rounded font-bold resize-none text-[11px]"
                            style={{ minWidth: '160px', minHeight: '40px' }}
                          />
                        ) : (
                          el.text
                        )}
                      </div>
                    );
                  }
                })}

                {elements.length === 0 && strokes.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none">
                    <span className="text-3xl mb-1">📋</span>
                    <span className="text-[10px] rpg-font-retro text-amber-500">Notice Board Kosong</span>
                    <span className="text-[8px] text-slate-400">Gunakan toolbar untuk menulis teks atau coret dengan pensil</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Figma-Like Floating Format Panel (Sidebar) */}
          <div className="w-full md:w-60 bg-slate-950/90 border border-slate-800 p-4 rounded flex flex-col justify-between text-xs overflow-y-auto">
            {selectedElement ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="font-bold text-amber-500 rpg-font-retro text-[8px] uppercase">
                    Element Editor
                  </span>
                  <button 
                    onClick={() => handleDeleteElement(selectedElement.id)}
                    className="text-red-400 hover:text-red-300 p-1 bg-red-950/40 rounded border border-red-900/30 animate-pulse"
                    title="Hapus"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Text editor box */}
                <div className="space-y-1">
                  <label className="block text-[8px] text-slate-400 font-bold uppercase">Edit Teks:</label>
                  <textarea
                    value={selectedElement.text}
                    onChange={(e) => updateElementProps(selectedElement.id, { text: e.target.value }, false)}
                    onBlur={() => updateElementProps(selectedElement.id, {}, true)}
                    rows={4}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-yellow-50 focus:outline-none focus:border-amber-500 font-mono font-bold"
                  />
                </div>

                {/* Typography controls */}
                <div className="space-y-2">
                  <label className="block text-[8px] text-slate-400 font-bold uppercase">Format Teks:</label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateElementProps(selectedElement.id, { isBold: !selectedElement.isBold }, true)}
                      className={`flex-1 py-1 px-2 border rounded font-bold text-center transition-colors ${
                        selectedElement.isBold 
                          ? 'bg-amber-500 text-slate-950 border-amber-400' 
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      B
                    </button>
                    <button
                      onClick={() => updateElementProps(selectedElement.id, { isItalic: !selectedElement.isItalic }, true)}
                      className={`flex-1 py-1 px-2 border rounded italic text-center transition-colors ${
                        selectedElement.isItalic 
                          ? 'bg-amber-500 text-slate-950 border-amber-400' 
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      I
                    </button>
                  </div>
                </div>

                {/* Font Size controls */}
                <div className="space-y-1">
                  <label className="block text-[8px] text-slate-400 font-bold uppercase">Ukuran Font ({selectedElement.fontSize || 16}px):</label>
                  <select
                    value={selectedElement.fontSize || 16}
                    onChange={(e) => updateElementProps(selectedElement.id, { fontSize: parseInt(e.target.value) }, true)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-300 p-1.5 rounded focus:outline-none focus:border-amber-500 font-bold"
                  >
                    {[12, 14, 16, 20, 24, 32].map(size => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </div>

                {/* Color Palette Picker (Sticky notes only) */}
                {selectedElement.type === 'sticky' && (
                  <div className="space-y-1.5 pt-2">
                    <label className="block text-[8px] text-slate-400 font-bold uppercase">
                      Warna Kertas:
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {['#fffd82', '#ffc6ff', '#9bf6ff', '#caffbf', '#fdffb6'].map(color => (
                        <button
                          key={color}
                          onClick={() => updateElementProps(selectedElement.id, { color }, true)}
                          style={{ backgroundColor: color }}
                          className={`w-6 h-6 rounded border-2 ${
                            selectedElement.color === color ? 'border-white scale-110' : 'border-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="my-auto text-center opacity-40 py-10 select-none">
                <span className="text-2xl block mb-2">🖱️</span>
                <p className="text-[10px] leading-normal font-semibold">Klik 2x pada sticky note / teks di papan untuk mengedit tulisan secara langsung.</p>
              </div>
            )}

            <div className="border-t border-slate-900 pt-3 mt-4 text-[9px] text-slate-500 leading-normal font-bold">
              <strong className="text-slate-400">Tips Figma Board:</strong>
              <ul className="list-disc pl-3 mt-1 space-y-1 font-semibold">
                <li>Klik ✋ untuk panning/geser canvas.</li>
                <li>Klik ✏️ lalu seret untuk coret pensil.</li>
                <li>Gunakan <strong>Ctrl + Scroll Mouse</strong> atau tombol toolbar untuk zoom.</li>
                <li>Gunakan <strong>Ctrl+Z</strong> / <strong>Ctrl+Y</strong> untuk undo/redo.</li>
                <li>Perubahan sinkron langsung secara real-time!</li>
              </ul>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
