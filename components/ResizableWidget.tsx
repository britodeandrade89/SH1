import React, { useRef, useState, useEffect } from 'react';
import { MoveDiagonal } from 'lucide-react';

interface ResizableWidgetProps {
  children: React.ReactNode;
  scale: number;
  onScaleChange: (newScale: number) => void;
  origin?: string;
  className?: string;
}

export const ResizableWidget: React.FC<ResizableWidgetProps> = ({ 
  children, 
  scale, 
  onScaleChange, 
  origin = "top left", 
  className = "" 
}) => {
  const [isSelected, setIsSelected] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startScale = useRef(1);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleStart = (clientY: number) => {
    isDragging.current = true;
    startY.current = clientY;
    startScale.current = scale;
    
    const handleMove = (y: number) => {
      if (!isDragging.current) return;
      const delta = (y - startY.current) * 0.005;
      onScaleChange(Math.max(0.5, Math.min(2.0, startScale.current + delta)));
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientY);

    const onEnd = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onEnd);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault();
    handleStart(e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation(); 
    e.preventDefault();
    handleStart(e.touches[0].clientY);
  };

  return (
    <div 
      ref={widgetRef} 
      className={`relative group transition-all duration-200 ${isSelected ? 'z-50' : 'z-auto'} ${className}`} 
      onClick={(e) => { e.stopPropagation(); setIsSelected(true); }} 
      style={{ transformOrigin: origin }}
    >
      <div 
        style={{ transform: `scale(${scale})`, transformOrigin: origin }} 
        className="transition-transform duration-75 ease-out"
      >
        {children}
      </div>
      
      {isSelected && (
        <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-yellow-400/50 rounded-xl">
          <div 
            className="absolute -bottom-3 -right-3 w-8 h-8 bg-yellow-400 rounded-full shadow-lg flex items-center justify-center cursor-nwse-resize pointer-events-auto hover:scale-110 active:bg-yellow-300 transition-transform" 
            onMouseDown={handleMouseDown} 
            onTouchStart={handleTouchStart}
          >
            <MoveDiagonal size={16} className="text-black" />
          </div>
        </div>
      )}
    </div>
  );
};