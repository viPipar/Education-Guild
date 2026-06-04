import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/supabase';
import type { Profile, BoardComment } from '../lib/supabase';
import { 
  X, Plus, Type, Undo2, Redo2, Trash2, Hand, MousePointer, Pencil, Eraser, Move, RotateCw, MessageSquare
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
  fontSize?: number; // 12, 14, 16, 20, 24, 32
  rotate?: number; // rotation in degrees
  width?: number; // custom width in px
  height?: number; // custom height in px
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
  currentProfile: Profile;
  onClose: () => void;
  profiles?: Profile[];
}

export const NoticeBoard: React.FC<NoticeBoardProps> = ({ roomId, currentProfile, onClose, profiles }) => {
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  
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
  // Use refs to avoid stale closures in callbacks and event listeners
  const historyRef = useRef<{ elements: BoardElement[]; strokes: WhiteboardStroke[] }[]>([]);
  const historyIndexRef = useRef(-1);

  // Keep refs in sync with state
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // Drag and Drop (Select Tool)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragStartClientPos, setDragStartClientPos] = useState({ x: 0, y: 0 });
  const wasSelectedBeforeDragRef = useRef(false);

  // Panning (Hand Tool)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Freehand Drawing (Pen/Eraser Tool)
  const [isDrawing, setIsDrawing] = useState(false);
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null);

  // Drag Rotate State
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotateStartAngle, setRotateStartAngle] = useState<number>(0);

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
    const loadedComments = w.comments || [];
    
    setElements(loadedElements);
    setStrokes(loadedStrokes);
    setComments(loadedComments);
    
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
        const remoteComments = msg.payload.comments || [];
        
        setElements(remoteElements);
        setStrokes(remoteStrokes);
        setComments(remoteComments);
        
        // Push remote state into local history so undo can go back
        // Use the ref to avoid stale closure capturing wrong historyIndex
        setHistory(prev => {
          const cut = prev.slice(0, historyIndexRef.current + 1);
          const next = [...cut, { elements: remoteElements, strokes: remoteStrokes }];
          historyRef.current = next;
          return next;
        });
        setHistoryIndex(prev => {
          const next = prev + 1;
          historyIndexRef.current = next;
          return next;
        });
      } else if (msg.type === 'whiteboard_typing' && msg.payload.roomId === roomId) {
        // Realtime collaborative typing, dragging, rotating sync (not pushed to DB history)
        const { elementId, updates } = msg.payload;
        setElements(prev => prev.map(el => el.id === elementId ? { ...el, ...updates } : el));
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
  // Uses stable handleUndo/handleRedo refs — no deps needed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (isTyping) return;
        e.preventDefault();
        // Call directly via refs to avoid stale closure
        const idx = historyIndexRef.current;
        const hist = historyRef.current;
        if (idx > 0) {
          playClick();
          const prevIndex = idx - 1;
          historyIndexRef.current = prevIndex;
          setHistoryIndex(prevIndex);
          const prev = hist[prevIndex];
          setElements(prev.elements);
          setStrokes(prev.strokes);
          db.saveWhiteboard(roomId, prev.strokes as any, prev.elements as any, comments);
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        if (isTyping) return;
        e.preventDefault();
        const idx = historyIndexRef.current;
        const hist = historyRef.current;
        if (idx < hist.length - 1) {
          playClick();
          const nextIndex = idx + 1;
          historyIndexRef.current = nextIndex;
          setHistoryIndex(nextIndex);
          const next = hist[nextIndex];
          setElements(next.elements);
          setStrokes(next.strokes);
          db.saveWhiteboard(roomId, next.strokes as any, next.elements as any, comments);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roomId, comments]);

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
  // Uses refs to avoid stale closure on historyIndex
  const saveState = async (newElements: BoardElement[], newStrokes: WhiteboardStroke[], pushToHistory = true) => {
    setElements(newElements);
    setStrokes(newStrokes);
    await db.saveWhiteboard(roomId, newStrokes as any, newElements as any, comments);

    if (pushToHistory) {
      // Always slice from the live ref to avoid acting on stale state
      const currentIdx = historyIndexRef.current;
      const updatedHistory = historyRef.current.slice(0, currentIdx + 1);
      const nextHistory = [...updatedHistory, { elements: newElements, strokes: newStrokes }];
      historyRef.current = nextHistory;
      historyIndexRef.current = updatedHistory.length;
      setHistory(nextHistory);
      setHistoryIndex(updatedHistory.length);
    }
  };

  const handleUndo = () => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx > 0) {
      playClick();
      const prevIndex = idx - 1;
      historyIndexRef.current = prevIndex;
      setHistoryIndex(prevIndex);
      const prev = hist[prevIndex];
      setElements(prev.elements);
      setStrokes(prev.strokes);
      db.saveWhiteboard(roomId, prev.strokes as any, prev.elements as any, comments);
    }
  };

  const handleRedo = () => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      playClick();
      const nextIndex = idx + 1;
      historyIndexRef.current = nextIndex;
      setHistoryIndex(nextIndex);
      const next = hist[nextIndex];
      setElements(next.elements);
      setStrokes(next.strokes);
      db.saveWhiteboard(roomId, next.strokes as any, next.elements as any, comments);
    }
  };

  const saveComments = async (newComments: BoardComment[]) => {
    setComments(newComments);
    await db.saveWhiteboard(roomId, strokes, elements, newComments);
  };

  const handleAddComment = () => {
    if (!newCommentText.trim()) return;
    playClick();
    const newComment: BoardComment = {
      id: 'comment_' + Date.now(),
      userName: currentProfile.name,
      userRole: currentProfile.role,
      text: newCommentText.trim(),
      createdAt: new Date().toISOString()
    };
    const updated = [...comments, newComment];
    saveComments(updated);
    setNewCommentText('');
  };

  const handleDeleteComment = (commentId: string) => {
    playClick();
    const updated = comments.filter(c => c.id !== commentId);
    saveComments(updated);
  };

  const handleClearAllComments = () => {
    if (window.confirm('Apakah Anda yakin ingin menghapus semua komentar di papan ini?')) {
      playClick();
      saveComments([]);
    }
  };

  // Canvas Mouse Interactions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode === 'select' || editingId) return;

    const rect = canvasRef.current!.getBoundingClientRect();
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
    
    const scrollLeft = containerRef.current ? containerRef.current.scrollLeft : 0;
    const scrollTop = containerRef.current ? containerRef.current.scrollTop : 0;
    const viewportWidth = containerRef.current ? containerRef.current.clientWidth : 800;
    const viewportHeight = containerRef.current ? containerRef.current.clientHeight : 450;
    
    const centerXPx = scrollLeft + viewportWidth / 2;
    const centerYPx = scrollTop + viewportHeight / 2;
    
    const xPct = Math.min(90, Math.max(5, (centerXPx / (workspaceWidth * zoomScale)) * 100));
    const yPct = Math.min(90, Math.max(5, (centerYPx / (workspaceHeight * zoomScale)) * 100));

    const newElement: BoardElement = {
      id: 'sticky_' + Date.now(),
      type: 'sticky',
      text: 'Double click atau pencet untuk edit...',
      x: xPct,
      y: yPct,
      color: randomColor,
      isBold: false,
      isItalic: false,
      fontSize: 16,
      rotate: 0,
      width: 144,
      height: 96
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
    
    const xPct = Math.min(90, Math.max(5, (centerXPx / (workspaceWidth * zoomScale)) * 100));
    const yPct = Math.min(90, Math.max(5, (centerYPx / (workspaceHeight * zoomScale)) * 100));

    const newElement: BoardElement = {
      id: 'text_' + Date.now(),
      type: 'text',
      text: 'Double click atau pencet untuk edit...',
      x: xPct,
      y: yPct,
      isBold: false,
      isItalic: false,
      fontSize: 16,
      rotate: 0,
      width: 180,
      height: 40
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
    setElements(updated);

    if (pushHistory) {
      saveState(updated, strokes, true);
    } else {
      // Realtime Typing Broadcast
      db.broadcast('whiteboard_typing', { roomId, elementId: id, updates });
    }
  };

  // Element Drag-and-Move Handle
  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    if (drawMode !== 'select') return;
    
    e.stopPropagation();
    playClick();
    
    wasSelectedBeforeDragRef.current = selectedId === id;
    setSelectedId(id);
    setDraggingId(id);
    setDragStartClientPos({ x: e.clientX, y: e.clientY });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    const element = elements.find(el => el.id === id);
    if (!element) return;

    const elXpx = (element.x / 100) * rect.width;
    const elYpx = (element.y / 100) * rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDragStartPos({
      x: mouseX - elXpx,
      y: mouseY - elYpx
    });
  };

  // Dedicated Drag-to-Rotate mouse handler
  const handleRotateMouseDown = (e: React.MouseEvent, el: BoardElement) => {
    e.stopPropagation();
    e.preventDefault();
    playClick();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate exact visual center of the element on absolute canvas coordinates (2000x1125)
    const elXpx = (el.x / 100) * rect.width;
    const elYpx = (el.y / 100) * rect.height;
    
    const elWpx = ((el.width || 144) / workspaceWidth) * rect.width;
    const elHpx = ((el.height || 90) / workspaceHeight) * rect.height;
    
    const centerX = elXpx + elWpx / 2;
    const centerY = elYpx + elHpx / 2;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const initialAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
    setRotatingId(el.id);
    setRotateStartAngle((el.rotate || 0) - initialAngle * (180 / Math.PI));
  };

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    if (draggingId && drawMode === 'select' && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let newXPx = mouseX - dragStartPos.x;
      let newYPx = mouseY - dragStartPos.y;

      const xPct = Math.min(95, Math.max(0, (newXPx / rect.width) * 100));
      const yPct = Math.min(95, Math.max(0, (newYPx / rect.height) * 100));

      setElements(prev => prev.map(el => {
        if (el.id === draggingId) {
          const updates = { x: xPct, y: yPct };
          db.broadcast('whiteboard_typing', { roomId, elementId: draggingId, updates });
          return { ...el, ...updates };
        }
        return el;
      }));
    } else if (rotatingId && drawMode === 'select' && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const el = elements.find(item => item.id === rotatingId);
      if (!el) return;
      
      const elXpx = (el.x / 100) * rect.width;
      const elYpx = (el.y / 100) * rect.height;
      const elWpx = ((el.width || 144) / workspaceWidth) * rect.width;
      const elHpx = ((el.height || 90) / workspaceHeight) * rect.height;
      
      const centerX = elXpx + elWpx / 2;
      const centerY = elYpx + elHpx / 2;
      
      const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
      const newAngle = (Math.round(rotateStartAngle + currentAngle) + 360) % 360;
      
      setElements(prev => prev.map(item => {
        if (item.id === rotatingId) {
          const updates = { rotate: newAngle };
          db.broadcast('whiteboard_typing', { roomId, elementId: rotatingId, updates });
          return { ...item, ...updates };
        }
        return item;
      }));
    }
  };

  const handleWorkspaceMouseUp = () => {
    if (draggingId) {
      saveState(elements, strokes, true);
      setDraggingId(null);
    }
    if (rotatingId) {
      saveState(elements, strokes, true);
      setRotatingId(null);
    }
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
      <div className="rpg-panel-glass max-w-7xl w-full flex flex-col h-[92vh] border-2 border-stone-600/50">
        
        {/* Whiteboard Header Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-center border-b border-amber-600/20 pb-3 mb-3 gap-2 px-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-500 font-bold text-xs uppercase tracking-wide rpg-font-retro pr-2 flex items-center gap-1.5">
              <span>📋</span> FIGMA BOARD — {roomId === 'guild_hall' ? 'GUILD HALL' : roomId.toUpperCase()}
            </span>
            
            {/* Draw mode selectors */}
            <div className="flex bg-slate-950 p-1 border border-slate-800 rounded">
              <button 
                onClick={() => { playSelect(); setDrawMode('select'); setEditingId(null); }}
                className={`p-1.5 rounded transition-colors ${drawMode === 'select' ? 'bg-amber-600 text-stone-950' : 'text-slate-400 hover:text-white'}`}
                title="Select & Edit Element (V)"
              >
                <MousePointer size={13} />
              </button>
              <button 
                onClick={() => { playSelect(); setDrawMode('pan'); setEditingId(null); }}
                className={`p-1.5 rounded transition-colors ${drawMode === 'pan' ? 'bg-amber-600 text-stone-950' : 'text-slate-400 hover:text-white'}`}
                title="Pan Canvas View (H)"
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

            {/* Brush styling selectors */}
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
                className="bg-slate-900 border border-amber-500/30 hover:border-amber-500 text-yellow-50 px-2.5 py-1.5 rounded text-[10px] flex items-center gap-1 font-bold"
              >
                <Plus size={10} /> Sticky Note
              </button>
              <button 
                onClick={handleAddText} 
                className="bg-slate-900 border border-amber-500/30 hover:border-amber-500 text-yellow-50 px-2.5 py-1.5 rounded text-[10px] flex items-center gap-1 font-bold"
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
              >
                -
              </button>
              <span className="text-yellow-100 font-mono w-10 text-center select-none text-[9px]">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => {
                  playSelect();
                  setZoomScale(prev => Math.min(2.0, Math.round((prev + 0.1) * 10) / 10));
                }}
                disabled={zoomScale >= 2.0}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 w-6 h-6 flex items-center justify-center font-bold"
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
              >
                100%
              </button>
            </div>

            {/* Clear drawings button */}
            {strokes.length > 0 && (
              <button
                onClick={handleClearDrawings}
                className="bg-red-950/40 hover:bg-red-900/60 border border-red-900/30 text-red-300 px-2 py-1 rounded text-[9px] flex items-center gap-1 font-bold"
                title="Hapus coretan kuas"
              >
                <Trash2 size={10} /> Coretan
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded bg-slate-900 border border-slate-850 ml-auto"
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
            className="flex-1 bg-[#15121b] border-2 border-slate-800 rounded overflow-auto relative cursor-default select-none no-scrollbar"
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
              {/* Scaled Whiteboard Canvas Workspace */}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          const dx = Math.abs(e.clientX - dragStartClientPos.x);
                          const dy = Math.abs(e.clientY - dragStartClientPos.y);
                          if (dx < 3 && dy < 3) {
                            if (wasSelectedBeforeDragRef.current) {
                              setEditingId(el.id);
                            }
                          }
                        }}
                        style={{
                          left: `${el.x}%`,
                          top: `${el.y}%`,
                          width: `${el.width || 144}px`,
                          minHeight: `${el.height || 96}px`,
                          transform: `rotate(${el.rotate || 0}deg)`,
                          backgroundColor: el.color || '#fffd82',
                          ...typoStyle
                        }}
                        className={`absolute p-3 shadow-2xl rounded text-slate-900 flex flex-col justify-between cursor-grab select-none z-10 border transition-shadow ${
                          isSelected ? 'border-blue-500 ring-2 ring-blue-400/40 z-30' : 'border-slate-800/10'
                        }`}
                      >
                        {/* Figma controls */}
                        {isSelected && (
                          <>
                            {/* Blue border outline */}
                            <div className="absolute inset-0 outline outline-2 outline-blue-500 pointer-events-none rounded" />
                            {/* Bounding box handles */}
                            <div className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            
                            {/* Dedicated Figma Bounding Box controls overlay */}
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-950 border border-blue-500 rounded px-1 py-0.5 flex gap-1 items-center z-[200] shadow-2xl text-white">
                              {/* Move pointer indicator */}
                              <div
                                onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-slate-800 rounded text-blue-400 hover:text-white cursor-move"
                                title="Geser / Move (Klik & Seret)"
                              >
                                <Move size={11} />
                              </div>
                              {/* Custom Rotate handle */}
                              <div
                                onMouseDown={(e) => handleRotateMouseDown(e, el)}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-slate-800 rounded text-yellow-400 hover:text-white cursor-pointer"
                                title="Putar / Rotate (Klik & Seret)"
                              >
                                <RotateCw size={11} />
                              </div>
                            </div>
                          </>
                        )}

                        {isEditing ? (
                          <textarea
                            autoFocus
                            value={el.text}
                            onChange={(e) => updateElementProps(el.id, { text: e.target.value }, false)}
                            onBlur={() => updateElementProps(el.id, {}, true)}
                            className="w-full h-full bg-black/10 border-none outline-none resize-none p-0 text-slate-950 font-mono font-bold text-xs"
                            style={{ minHeight: '60px' }}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap leading-tight break-words pr-1 flex-1 font-mono text-[10px]">
                            {el.text}
                          </p>
                        )}
                        <span className="text-[6px] text-slate-600 block mt-1 font-sans font-bold select-none uppercase tracking-wider">STICKY</span>
                      </div>
                    );
                  } else {
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          const dx = Math.abs(e.clientX - dragStartClientPos.x);
                          const dy = Math.abs(e.clientY - dragStartClientPos.y);
                          if (dx < 3 && dy < 3) {
                            if (wasSelectedBeforeDragRef.current) {
                              setEditingId(el.id);
                            }
                          }
                        }}
                        style={{
                          left: `${el.x}%`,
                          top: `${el.y}%`,
                          width: `${el.width || 180}px`,
                          minHeight: `${el.height || 40}px`,
                          transform: `rotate(${el.rotate || 0}deg)`,
                          color: '#fff',
                          ...typoStyle
                        }}
                        className={`absolute p-2 cursor-grab select-none z-10 border rounded bg-slate-950/20 whitespace-pre-wrap break-words ${
                          isSelected ? 'border-blue-500 bg-slate-950/70 z-30' : 'border-transparent hover:border-slate-700/50'
                        }`}
                      >
                        {/* Figma controls */}
                        {isSelected && (
                          <>
                            <div className="absolute inset-0 outline outline-2 outline-blue-500 pointer-events-none rounded" />
                            <div className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-blue-500 rounded-sm pointer-events-none" />
                            
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-950 border border-blue-500 rounded px-1 py-0.5 flex gap-1 items-center z-[200] shadow-2xl text-white">
                              <div
                                onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-slate-800 rounded text-blue-400 hover:text-white cursor-move"
                                title="Geser / Move"
                              >
                                <Move size={11} />
                              </div>
                              <div
                                onMouseDown={(e) => handleRotateMouseDown(e, el)}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-slate-800 rounded text-yellow-400 hover:text-white cursor-pointer"
                                title="Putar / Rotate"
                              >
                                <RotateCw size={11} />
                              </div>
                            </div>
                          </>
                        )}

                        {isEditing ? (
                          <textarea
                            autoFocus
                            value={el.text}
                            onChange={(e) => updateElementProps(el.id, { text: e.target.value }, false)}
                            onBlur={() => updateElementProps(el.id, {}, true)}
                            className="w-full bg-slate-900 text-yellow-100 border border-slate-700 outline-none p-1 rounded font-bold resize-none text-[11px]"
                            style={{ minWidth: '100%', minHeight: '32px' }}
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
                    <span className="text-[8px] text-slate-400">Gunakan toolbar atas untuk menulis dan mendesain kustom!</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Figma-Like Floating format Panel / Inspector (Sidebar) */}
          <div className="w-full md:w-60 bg-[#1e1e1e] border-l border-[#2c2c2c] p-4 flex flex-col text-[#e0e0e0] font-sans overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 no-scrollbar min-h-0">
              {selectedElement ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-[#2c2c2c] pb-2">
                    <span className="font-bold text-amber-500 font-mono text-[9px] uppercase tracking-wider">
                      📐 PROPERTIES INSPECTOR
                    </span>
                    <button 
                      onClick={() => handleDeleteElement(selectedElement.id)}
                      className="text-red-400 hover:text-red-300 p-1 bg-red-950/40 rounded border border-red-900/30"
                      title="Delete Element"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* Text editor box */}
                  <div className="space-y-1">
                    <label className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider">Content Text:</label>
                    <textarea
                      value={selectedElement.text}
                      onChange={(e) => updateElementProps(selectedElement.id, { text: e.target.value }, false)}
                      onBlur={() => updateElementProps(selectedElement.id, {}, true)}
                      rows={4}
                      className="w-full bg-[#151515] border border-[#2c2c2c] rounded p-2 text-xs text-yellow-50 focus:outline-none focus:border-blue-500 font-mono font-bold resize-none"
                    />
                  </div>

                  {/* Position and Dimensions (Figma Layout Style) */}
                  <div className="space-y-2 border-t border-[#2c2c2c] pt-3">
                    <label className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider">Geometry Layout:</label>
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      <div>
                        <span className="text-slate-500 block font-bold font-mono">X (POSISI %)</span>
                        <input
                          type="number"
                          value={Math.round(selectedElement.x)}
                          onChange={(e) => updateElementProps(selectedElement.id, { x: Math.min(100, Math.max(0, Number(e.target.value))) }, true)}
                          className="w-full bg-[#151515] border border-[#2c2c2c] rounded p-1 text-xs text-slate-100 font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block font-bold font-mono">Y (POSISI %)</span>
                        <input
                          type="number"
                          value={Math.round(selectedElement.y)}
                          onChange={(e) => updateElementProps(selectedElement.id, { y: Math.min(100, Math.max(0, Number(e.target.value))) }, true)}
                          className="w-full bg-[#151515] border border-[#2c2c2c] rounded p-1 text-xs text-slate-100 font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block font-bold font-mono">W (LEBAR PX)</span>
                        <input
                          type="number"
                          value={selectedElement.width || (selectedElement.type === 'sticky' ? 144 : 180)}
                          onChange={(e) => updateElementProps(selectedElement.id, { width: Math.max(50, Number(e.target.value)) }, true)}
                          className="w-full bg-[#151515] border border-[#2c2c2c] rounded p-1 text-xs text-slate-100 font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block font-bold font-mono">H (TINGGI PX)</span>
                        <input
                          type="number"
                          value={selectedElement.height || (selectedElement.type === 'sticky' ? 96 : 40)}
                          onChange={(e) => updateElementProps(selectedElement.id, { height: Math.max(30, Number(e.target.value)) }, true)}
                          className="w-full bg-[#151515] border border-[#2c2c2c] rounded p-1 text-xs text-slate-100 font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500 block font-bold font-mono">ROTATION (ANGLE)</span>
                        <div className="flex gap-1.5 items-center">
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={selectedElement.rotate || 0}
                            onChange={(e) => updateElementProps(selectedElement.id, { rotate: Number(e.target.value) }, true)}
                            className="flex-1 accent-blue-500 h-1 cursor-pointer"
                          />
                          <span className="text-yellow-100 font-mono text-[9px] w-8 text-right">{(selectedElement.rotate || 0)}°</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Typography controls */}
                  <div className="space-y-2 border-t border-[#2c2c2c] pt-3">
                    <label className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider">Typography Text:</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateElementProps(selectedElement.id, { isBold: !selectedElement.isBold }, true)}
                        className={`flex-1 py-1.5 px-2 border rounded font-bold text-center text-xs transition-colors ${
                          selectedElement.isBold 
                            ? 'bg-blue-600 text-white border-blue-400' 
                            : 'bg-[#151515] text-slate-400 border-[#2c2c2c] hover:border-slate-700'
                        }`}
                      >
                        B
                      </button>
                      <button
                        onClick={() => updateElementProps(selectedElement.id, { isItalic: !selectedElement.isItalic }, true)}
                        className={`flex-1 py-1.5 px-2 border rounded italic text-center text-xs transition-colors ${
                          selectedElement.isItalic 
                            ? 'bg-blue-600 text-white border-blue-400' 
                            : 'bg-[#151515] text-slate-400 border-[#2c2c2c] hover:border-slate-700'
                        }`}
                      >
                        I
                      </button>
                    </div>
                  </div>

                  {/* Font Size controls */}
                  <div className="space-y-1">
                    <label className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider">Font Size ({selectedElement.fontSize || 16}px):</label>
                    <select
                      value={selectedElement.fontSize || 16}
                      onChange={(e) => updateElementProps(selectedElement.id, { fontSize: parseInt(e.target.value) }, true)}
                      className="w-full bg-[#151515] border border-[#2c2c2c] text-slate-300 p-1.5 rounded focus:outline-none focus:border-blue-500 font-bold"
                    >
                      {[12, 14, 16, 20, 24, 32].map(size => (
                        <option key={size} value={size}>{size}px</option>
                      ))}
                    </select>
                  </div>

                  {/* Color Palette Picker */}
                  {selectedElement.type === 'sticky' && (
                    <div className="space-y-1.5 pt-2 border-t border-[#2c2c2c]">
                      <label className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                        Fill Color:
                      </label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {['#fffd82', '#ffc6ff', '#9bf6ff', '#caffbf', '#fdffb6'].map(color => (
                          <button
                            key={color}
                            onClick={() => updateElementProps(selectedElement.id, { color }, true)}
                            style={{ backgroundColor: color }}
                            className={`w-6 h-6 rounded border-2 ${
                              selectedElement.color === color ? 'border-blue-500 scale-110' : 'border-transparent'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <div className="my-auto text-center opacity-40 py-10 select-none">
                  <MousePointer className="mx-auto text-amber-500 mb-2" size={24} />
                  <p className="text-[10px] leading-normal font-semibold">Pilih atau klik note/teks di kanvas untuk membuka Figma Inspector panel.</p>
                </div>
              )}
            </div>

            {/* Google Docs-Style Comments Panel */}
            <div className="border-t border-[#2c2c2c] pt-3 mt-4 flex flex-col max-h-[220px] min-h-[120px] min-w-0">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-[#2c2c2c]">
                <span className="font-bold text-amber-500 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1">
                  <MessageSquare size={10} /> KOMENTAR ({comments.length})
                </span>
                {comments.length > 0 && (
                  <button
                    onClick={handleClearAllComments}
                    className="text-[8px] text-red-400 hover:text-red-300 font-bold uppercase hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 text-[10px] no-scrollbar">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-[#181818] border border-[#2c2c2c] rounded p-2 relative group">
                    <div className="flex justify-between items-start gap-1 mb-1">
                      {(() => {
                        const author = profiles?.find(p => p.name === comment.userName);
                        return (
                          <span 
                            className="font-bold truncate block max-w-[120px]" 
                            style={{ color: author?.sprite_json.nameColor || '#fef08a' }}
                            title={comment.userName}
                          >
                            {comment.userName.split(' ')[0]} <span className="text-[7px] text-slate-500 font-normal">({comment.userRole})</span>
                          </span>
                        );
                      })()}
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-[8px]"
                        title="Hapus Komentar"
                      >
                        Hapus
                      </button>
                    </div>
                    <p className="text-slate-300 break-words leading-relaxed whitespace-pre-wrap font-semibold text-[9.5px]">
                      {comment.text}
                    </p>
                    <span className="text-[6px] text-slate-600 block mt-1 font-mono text-right">
                      {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div className="my-auto text-center opacity-30 py-6 select-none">
                    <span className="text-xl block mb-1">💬</span>
                    <p className="text-[8px] font-semibold">Belum ada komentar. Tulis sesuatu di bawah!</p>
                  </div>
                )}
              </div>

              {/* Comment Input */}
              <div className="mt-2 pt-2 border-t border-[#2c2c2c] flex gap-1">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Tambah komentar..."
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  className="flex-1 bg-[#151515] border border-[#2c2c2c] rounded px-2 py-1 text-xs text-yellow-50 focus:outline-none focus:border-blue-500 font-sans resize-none text-[10px]"
                />
                <button
                  onClick={handleAddComment}
                  className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold px-2 rounded flex items-center justify-center text-[10px]"
                >
                  Kirim
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
