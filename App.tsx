import React, { useState, useEffect, useRef } from 'react';
import { 
  CloudRain, Sun, Moon, ArrowRight, ArrowLeft, Bell, Sparkles, ChefHat, X, Send, Newspaper, Plus, MapPin, 
  Settings, Mic, Lock, Unlock, Thermometer, Droplets
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';

import { getDB, addReminderToDB } from './services/firebase';
import { processCommandWithGemini, askChefAI } from './services/geminiService';
import { ResizableWidget } from './components/ResizableWidget';
import { Reminder, WeatherData, NewsData } from './types';

// --- UTILS ---
const speak = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.1; 
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') && v.name.includes('Google'));
    if (ptVoice) utterance.voice = ptVoice;
    window.speechSynthesis.speak(utterance);
  }
};

const getCyclicalReminders = (currentTime: Date): Reminder[] => {
  const day = currentTime.getDay();
  const hour = currentTime.getHours();
  const list: Reminder[] = [];

  if (day === 1 && hour >= 19) list.push({ type: 'alert', text: "Marmitas: André não tem aula amanhã.", time: "19:00", id: 'c1' });
  if (day === 2) {
    list.push({ type: 'action', text: "Terapia da Marcelly", time: "Dia", id: 'c2' });
    list.push({ type: 'action', text: "Terapia do André", time: "Dia", id: 'c3' });
    list.push({ type: 'info', text: "Terapia Familiar", time: "Dia", id: 'c4' });
    list.push({ type: 'alert', text: "André: Cozinhar (Marcelly Terapia)", time: "Noite", id: 'c5' });
  }
  if (day === 3) { 
     list.push({ type: 'info', text: "Verificar plantas e jardim", time: "09:00", id: 'c6' });
  }
  if (day === 4) list.push({ type: 'action', text: "Vôlei do André (Bicicleta)", time: "16:30", id: 'c7' });
  
  return list;
};

// --- COMPONENTS LOCAL ---
const NewsWidget = ({ category, color, data, index }: { category: string, color: string, data: any[], index: number }) => (
  <div className="flex gap-3 items-center animate-fade-in h-[70px] bg-white/5 rounded-xl p-2 border border-white/5 hover:bg-white/10 transition-colors">
    <div className={`w-1 h-full rounded-full ${color} opacity-80`} />
    <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden relative shrink-0">
       <Newspaper className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20" size={16} />
       {data[index]?.img && <img src={data[index].img} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform hover:scale-110" />}
    </div>
    <div className="flex-1 min-w-0">
       <div className="flex justify-between mb-1">
          <span className={`text-[10px] font-bold uppercase ${color.replace('bg-', 'text-')}`}>{category}</span>
          <span className="text-[9px] text-white/40">Agora</span>
       </div>
       <p className="text-xs font-light leading-snug line-clamp-2">{data[index]?.text || "Carregando notícias..."}</p>
    </div>
  </div>
);

const App = () => {
  // State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData>({ temperature: '--', weathercode: 0, is_day: 1, apparent_temperature: '--', precipitation_probability: 0 });
  const [locationName, setLocationName] = useState('Maricá, RJ');
  const [coords, setCoords] = useState({ lat: -22.9194, lon: -42.8186 });
  const [gpsActive, setGpsActive] = useState(false);
  
  // Voice & Interaction
  const [isActiveProcessing, setIsActiveProcessing] = useState(false);
  const [isCommandMode, setIsCommandMode] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [lastDetectedPerson, setLastDetectedPerson] = useState<'André' | 'Marcelly' | null>(null);
  
  // Data
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newsData, setNewsData] = useState<NewsData>({ politica: [], esportes: [], cultura: [] });
  const [newsIndices, setNewsIndices] = useState({ p: 0, e: 0, c: 0 });
  
  // UI Layout
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarSplit, setSidebarSplit] = useState(0.5);
  const [scales, setScales] = useState({ tl: 1, tr: 1, center: 1, bl: 1, br: 1 });
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderText, setNewReminderText] = useState('');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  
  // Modals
  const [isChefOpen, setIsChefOpen] = useState(false);
  const [chefInput, setChefInput] = useState('');
  const [chefResponse, setChefResponse] = useState('');
  const [isChefLoading, setIsChefLoading] = useState(false);
  
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [trainingStep, setTrainingStep] = useState(0);

  // Refs
  const sidebarRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const isResizingWidth = useRef(false);
  const isResizingHeight = useRef(false);
  const wakeWordRef = useRef<any>(null);
  const commandRef = useRef<any>(null);

  // --- LOGIC ---

  // Voice Recognition Flow
  const startWakeWordListener = () => {
    if (!window.webkitSpeechRecognition && !window.SpeechRecognition) return;
    
    // Stop instances
    if (wakeWordRef.current) wakeWordRef.current.stop();
    if (commandRef.current) commandRef.current.stop();

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';

    recognition.onresult = (event: any) => {
      const resultsLength = event.results.length;
      const transcript = event.results[resultsLength - 1][0].transcript.toLowerCase();
      
      console.log("Wake word check:", transcript);

      if (transcript.includes('smart home') || transcript.includes('ok smart')) {
        recognition.stop();
        startCommandListener();
      }
    };

    recognition.onend = () => {
      if (!isCommandMode && !isTrainingOpen && !isActiveProcessing) {
        try { recognition.start(); } catch (e) { console.log("Resume wake word listener"); }
      }
    };

    wakeWordRef.current = recognition;
    try { recognition.start(); } catch (e) { console.error(e); }
  };

  const startCommandListener = () => {
    setIsCommandMode(true);
    speak("Sim?");

    // Small delay to ensure synthesis doesn't trigger recognition
    setTimeout(() => {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const cmd = new SpeechRecognition();
      cmd.continuous = false;
      cmd.interimResults = false;
      cmd.lang = 'pt-BR';
      
      cmd.onresult = async (e: any) => {
        const command = e.results[0][0].transcript;
        setIsCommandMode(false);
        setIsActiveProcessing(true);
        
        const result = await processCommandWithGemini(command);
        if (result.response) speak(result.response);
        
        setIsActiveProcessing(false);
        startWakeWordListener();
      };

      cmd.onerror = () => {
        setIsCommandMode(false);
        startWakeWordListener();
      };

      cmd.onend = () => {
        if (isCommandMode) { // If ended without result
             setIsCommandMode(false);
             startWakeWordListener();
        }
      };
      
      commandRef.current = cmd;
      try { cmd.start(); } catch(e) { console.error(e); }
    }, 1000);
  };

  useEffect(() => {
    startWakeWordListener();
    return () => {
      if (wakeWordRef.current) wakeWordRef.current.stop();
      if (commandRef.current) commandRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Time & Weather
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      const h = now.getHours();
      const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
      if (lastDetectedPerson) setGreeting(`${g}, ${lastDetectedPerson}!`);
      else setGreeting(g);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastDetectedPerson]);

  useEffect(() => {
    // Attempt Geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
            setGpsActive(true);
            setLocationName("Localização Atual");
        }, () => {
            console.log("GPS denied, using default");
        });
    }

    const getWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,apparent_temperature,is_day,weather_code&hourly=precipitation_probability&timezone=America/Sao_Paulo`);
        const data = await res.json();
        if (data?.current) {
           const h = new Date().getHours();
           setWeather({
             temperature: data.current.temperature_2m,
             apparent_temperature: data.current.apparent_temperature,
             is_day: data.current.is_day,
             weathercode: data.current.weather_code,
             precipitation_probability: data.hourly?.precipitation_probability?.[h] || 0
           });
        }
      } catch (e) { console.error(e); }
    };
    getWeather();
    const i = setInterval(getWeather, 600000); // 10 min
    return () => clearInterval(i);
  }, [coords.lat, coords.lon]);

  // Firestore Reminders
  useEffect(() => {
    const db = getDB();
    if (db) {
      const q = query(collection(db, "smart_home_reminders"), orderBy("createdAt", "desc"));
      return onSnapshot(q, (snap) => {
        setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
      });
    }
  }, []);

  // News Cycle with BETTER Contextual Images
  useEffect(() => {
    const newsContent = {
       politica: [
           { text: "Lula defende cooperação internacional no G20.", img: "https://images.unsplash.com/photo-1529108190281-9a4f72008eac?auto=format&fit=crop&w=300&q=80" }, // G20/Meeting
           { text: "Câmara aprova reforma tributária em primeiro turno.", img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=300&q=80" }, // Finance/Gov
           { text: "Senado discute novas regras para IA.", img: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=300&q=80" } // Tech/Robot
       ],
       esportes: [
           { text: "Flamengo investe em novo centro de treinamento.", img: "https://images.unsplash.com/photo-1522778119026-d647f0565c6a?auto=format&fit=crop&w=300&q=80" }, // Stadium
           { text: "Brasil vence amistoso preparatório para a copa.", img: "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=300&q=80" }, // Brazil Jersey
           { text: "Vôlei: Seleção garante vaga com vitória histórica.", img: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=300&q=80" } // Volleyball
       ],
       cultura: [
           { text: "Filme brasileiro é premiado em Cannes.", img: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=300&q=80" }, // Cinema
           { text: "Festival de Jazz atrai multidão em SP.", img: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=300&q=80" }, // Music
           { text: "Nova exposição imersiva de Van Gogh chega ao Rio.", img: "https://images.unsplash.com/photo-1578321272182-37851cf96d00?auto=format&fit=crop&w=300&q=80" } // Art
       ]
    };

    setNewsData({ 
        politica: newsContent.politica.map(n => ({ ...n, time: "Agora" })), 
        esportes: newsContent.esportes.map(n => ({ ...n, time: "Agora" })), 
        cultura: newsContent.cultura.map(n => ({ ...n, time: "Agora" })) 
    });

    const t1 = setInterval(() => setNewsIndices(p => ({ ...p, p: (p.p + 1) % 3 })), 15000);
    const t2 = setTimeout(() => setInterval(() => setNewsIndices(p => ({ ...p, e: (p.e + 1) % 3 })), 15000), 5000);
    const t3 = setTimeout(() => setInterval(() => setNewsIndices(p => ({ ...p, c: (p.c + 1) % 3 })), 15000), 10000);
    return () => { clearInterval(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Layout Resizing
  const handleResizeMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isResizingWidth.current && !isResizingHeight.current) return;
    
    // Normalize touch/mouse
    const cx = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    if (isResizingWidth.current && appRef.current) {
      setSidebarWidth(Math.max(250, Math.min(600, appRef.current.getBoundingClientRect().right - cx)));
    }
    if (isResizingHeight.current && sidebarRef.current) {
      const rect = sidebarRef.current.getBoundingClientRect();
      setSidebarSplit(Math.max(0.2, Math.min(0.8, (cy - rect.top) / rect.height)));
    }
  };
  const stopResize = () => { isResizingWidth.current = false; isResizingHeight.current = false; };

  // Handlers
  const handleAddReminderManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText.trim()) return;
    await addReminderToDB(newReminderText, 'info');
    setNewReminderText(''); 
    setShowAddReminder(false);
  };

  const handleAskChef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chefInput.trim()) return;
    setIsChefLoading(true); 
    setChefResponse('');
    const res = await askChefAI(chefInput);
    setChefResponse(res);
    setIsChefLoading(false);
  };
  
  const handleVoiceTraining = () => {
    if (trainingStep === 0) return; 
    setTrainingStep(2); 
    setTimeout(() => {
      setTrainingStep(3); 
      setLastDetectedPerson(trainingStep === 1.1 ? 'André' : 'Marcelly');
      setTimeout(() => { setIsTrainingOpen(false); setTrainingStep(0); }, 2000);
    }, 3000);
  };

  const toggleWakeLock = async () => {
      if (!wakeLockActive && 'wakeLock' in navigator) {
          try {
              await (navigator as any).wakeLock.request('screen');
              setWakeLockActive(true);
          } catch(e) { console.error(e); }
      } else {
          setWakeLockActive(false);
      }
  };

  // Render Helpers
  const WeatherIcon = () => {
    const { is_day, weathercode } = weather;
    if (weathercode >= 51) return <CloudRain className="text-blue-300" size={48} />;
    return is_day === 1 ? <Sun className="text-yellow-300" size={48} /> : <Moon className="text-yellow-100" size={48} />;
  };

  const bgStyle = weather.is_day ? 
    { backgroundImage: `url("https://images.unsplash.com/photo-1622396481328-9b1b78cdd9fd?q=80&w=1920&auto=format&fit=crop")`, backgroundSize: 'cover', backgroundPosition: 'center' } : 
    { backgroundImage: `url("https://images.unsplash.com/photo-1472552944129-b035e9ea43cc?q=80&w=1920&auto=format&fit=crop")`, backgroundSize: 'cover', backgroundPosition: 'center' };

  const allReminders = [...getCyclicalReminders(currentTime), ...reminders];
  const dateInfo = {
    day: currentTime.getDate(),
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(currentTime),
    yesterday: new Date(new Date().setDate(currentTime.getDate() - 1)).getDate(),
    tomorrow: new Date(new Date().setDate(currentTime.getDate() + 1)).getDate(),
  };

  return (
    <div 
        ref={appRef} 
        style={bgStyle} 
        className="w-full h-screen relative overflow-hidden bg-black text-white selection:bg-none font-sans flex" 
        onMouseMove={handleResizeMove} 
        onMouseUp={stopResize} 
        onTouchMove={handleResizeMove} 
        onTouchEnd={stopResize}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Status Overlay */}
      {(isCommandMode || isActiveProcessing) && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/80 px-8 py-4 rounded-full border border-green-500/50 shadow-2xl animate-fade-in backdrop-blur-md">
           {isActiveProcessing ? <Sparkles className="animate-spin text-blue-400" /> : <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />}
           <span className="text-xl font-bold uppercase tracking-widest">{isActiveProcessing ? "Processando..." : "Ouvindo..."}</span>
        </div>
      )}

      {/* Main Content Area */}
      <section className="relative z-10 flex-1 flex flex-col justify-between p-8 overflow-hidden">
        
        {/* Top Section */}
        <div className="flex justify-between items-start">
           <ResizableWidget scale={scales.tl} onScaleChange={(s) => setScales({...scales, tl: s})} origin="top left">
              <div className="flex flex-col items-start drop-shadow-lg">
                 <div className="text-3xl font-light flex items-center gap-2">{greeting}</div>
                 <div className="text-[7rem] leading-none font-medium -ml-1">
                    {currentTime.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                 </div>
                 <div className="text-sm opacity-60 uppercase tracking-widest ml-2">Brasília, DF</div>
              </div>
           </ResizableWidget>
           
           <div className="flex flex-col items-end gap-2">
             <div className="flex gap-2">
               <button onClick={() => setIsChefOpen(true)} className="bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors backdrop-blur-sm border border-white/5"><ChefHat size={20} /></button>
             </div>
             <ResizableWidget scale={scales.tr} onScaleChange={(s) => setScales({...scales, tr: s})} origin="top right">
                <div className="flex items-center gap-4 bg-black/20 p-4 rounded-3xl backdrop-blur-sm border border-white/5">
                   <div className="flex flex-col items-end">
                      <span className="text-6xl font-medium leading-none">{weather.temperature !== '--' ? Math.round(Number(weather.temperature)) + '°' : '--'}</span>
                      <span className="text-xs uppercase opacity-80 flex items-center gap-1 mt-1">{gpsActive && <MapPin size={10} />} {locationName}</span>
                      <div className="flex gap-2 text-xs opacity-70 mt-1">
                        <span className="flex gap-1 items-center"><Thermometer size={10}/> {weather.apparent_temperature !== '--' ? Math.round(Number(weather.apparent_temperature)) + '°' : '--'}</span>
                        <span className="flex gap-1 items-center"><Droplets size={10}/> {weather.precipitation_probability}%</span>
                      </div>
                   </div>
                   <div className="drop-shadow-lg"><WeatherIcon /></div>
                </div>
             </ResizableWidget>
           </div>
        </div>

        {/* Center Date */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none">
           <ResizableWidget scale={scales.center} onScaleChange={(s) => setScales({...scales, center: s})} origin="center" className="pointer-events-auto">
              <div className="text-center drop-shadow-2xl">
                 <span className="text-2xl uppercase tracking-[0.5em] font-bold text-yellow-400 block mb-2 opacity-80">HOJE</span>
                 <span className="text-[14rem] leading-[0.8] font-bold block">{dateInfo.day}</span>
                 <span className="text-5xl font-light capitalize block mt-4">{dateInfo.weekday.split('-')[0]}</span>
              </div>
           </ResizableWidget>
        </div>

        {/* Bottom Nav/Dates */}
        <div className="flex justify-between w-full">
           <ResizableWidget scale={scales.bl} onScaleChange={(s) => setScales({...scales, bl: s})} origin="bottom left" className="flex items-center gap-4 bg-black/30 backdrop-blur-md p-4 rounded-2xl border border-white/5 opacity-80 hover:opacity-100 transition-opacity">
              <ArrowLeft size={24} className="text-white/50" />
              <div className="text-left">
                  <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Ontem</div>
                  <div className="text-2xl font-medium">{dateInfo.yesterday}</div>
              </div>
           </ResizableWidget>
           <ResizableWidget scale={scales.br} onScaleChange={(s) => setScales({...scales, br: s})} origin="bottom right" className="flex items-center gap-4 bg-black/30 backdrop-blur-md p-4 rounded-2xl border border-white/5 opacity-80 hover:opacity-100 transition-opacity">
              <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Amanhã</div>
                  <div className="text-2xl font-medium">{dateInfo.tomorrow}</div>
              </div>
              <ArrowRight size={24} className="text-white/50" />
           </ResizableWidget>
        </div>
      </section>

      {/* Resize Handle for Sidebar */}
      <div 
        className="relative z-50 flex items-center justify-center w-4 cursor-col-resize hover:bg-white/10 group transition-colors" 
        onMouseDown={(e)=>{e.preventDefault();isResizingWidth.current=true}} 
        onTouchStart={(e)=>{e.preventDefault();isResizingWidth.current=true}}
      >
         <div className="w-1 h-12 bg-white/20 rounded-full group-hover:bg-yellow-400 transition-colors" />
      </div>

      {/* Sidebar */}
      <aside 
        ref={sidebarRef} 
        className="relative z-20 bg-black/60 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl" 
        style={{ width: `${sidebarWidth}px` }}
      >
         {/* Top Half: Reminders */}
         <div className="flex flex-col border-b border-white/10 overflow-hidden" style={{ height: `${sidebarSplit * 100}%` }}>
            <div className="p-6 flex-1 flex flex-col overflow-hidden relative">
               <div className="flex justify-between items-center mb-6 text-yellow-300 z-10">
                  <div className="flex items-center gap-2">
                    <Bell size={20} /> 
                    <span className="text-sm font-bold uppercase tracking-widest">Lembretes</span>
                  </div>
                  <button onClick={() => setShowAddReminder(!showAddReminder)} className="hover:bg-white/10 p-1 rounded transition-colors"><Plus size={18}/></button>
               </div>
               
               {showAddReminder && (
                 <form onSubmit={handleAddReminderManual} className="flex gap-2 mb-4 z-10">
                    <input 
                        autoFocus 
                        className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400" 
                        value={newReminderText} 
                        onChange={e => setNewReminderText(e.target.value)} 
                        placeholder="Novo lembrete..."
                    />
                    <button className="bg-yellow-500 text-black px-3 rounded-lg font-bold text-xs hover:bg-yellow-400">OK</button>
                 </form>
               )}

               <div className="flex-1 overflow-hidden relative pause-on-hover mask-gradient-y">
                 {allReminders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 gap-2">
                        <Bell size={40} />
                        <p className="text-xs">Tudo limpo</p>
                    </div>
                 ) : (
                   <div className={`flex flex-col gap-3 absolute w-full ${allReminders.length > 4 ? 'animate-vertical-scroll' : ''}`}>
                      {/* Duplicate list for seamless scroll if needed */}
                      {[...allReminders, ...(allReminders.length > 4 ? allReminders : [])].map((r, i) => (
                        <div key={`${r.id}-${i}`} className={`p-4 rounded-xl border backdrop-blur-sm transition-transform hover:scale-[1.02] ${
                            r.type === 'alert' ? 'bg-red-500/10 border-red-500/30' : 
                            r.type === 'action' ? 'bg-blue-500/10 border-blue-500/30' : 
                            'bg-white/5 border-white/5'
                        }`}>
                           <div className="flex justify-between text-[10px] opacity-70 uppercase font-bold mb-1">
                              <span className={r.type === 'alert' ? 'text-red-300' : r.type === 'action' ? 'text-blue-300' : 'text-gray-400'}>
                                {r.type === 'alert' ? 'Urgente' : r.type === 'action' ? 'Tarefa' : 'Info'}
                              </span>
                              <span>{r.time}</span>
                           </div>
                           <p className="text-sm font-light leading-snug">{r.text}</p>
                        </div>
                      ))}
                   </div>
                 )}
               </div>
            </div>
         </div>

         {/* Resize Handle Sidebar Vertical */}
         <div 
            className="h-4 cursor-row-resize flex items-center justify-center hover:bg-white/5 -my-2 z-50 relative" 
            onMouseDown={(e)=>{e.preventDefault();isResizingHeight.current=true}} 
            onTouchStart={(e)=>{e.preventDefault();isResizingHeight.current=true}}
         >
            <div className="w-12 h-1 bg-white/20 rounded-full" />
         </div>

         {/* Bottom Half: News */}
         <div className="flex-1 p-6 flex flex-col overflow-hidden bg-black/20">
            <div className="flex items-center gap-2 mb-4 text-blue-300">
                <Newspaper size={20} />
                <span className="text-sm font-bold uppercase tracking-widest">Notícias</span>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto hide-scrollbar flex-1">
               <NewsWidget category="Política" color="bg-blue-500" data={newsData.politica} index={newsIndices.p} />
               <NewsWidget category="Esportes" color="bg-green-500" data={newsData.esportes} index={newsIndices.e} />
               <NewsWidget category="Cultura" color="bg-purple-500" data={newsData.cultura} index={newsIndices.c} />
            </div>
         </div>
      </aside>

      {/* Settings / Lock */}
      <div className="absolute bottom-6 left-6 z-50 flex items-center gap-2">
        <button onClick={() => setIsTrainingOpen(true)} className="bg-black/40 backdrop-blur hover:bg-white/10 p-3 rounded-full border border-white/5 transition-colors text-white/70 hover:text-white">
            <Settings size={20} />
        </button>
        <button onClick={toggleWakeLock} className="p-3 bg-black/40 backdrop-blur rounded-full border border-white/5 text-white/50 hover:bg-white/10 transition-colors">
            {wakeLockActive ? <Lock size={16} className="text-green-400" /> : <Unlock size={16} className="text-yellow-400 animate-pulse" />}
        </button>
      </div>

      {/* Voice ID Modal */}
      {isTrainingOpen && (
        <div className="absolute inset-0 z-[70] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-fade-in">
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative text-center">
                <button onClick={() => { setIsTrainingOpen(false); setTrainingStep(0); }} className="absolute top-4 right-4 text-white/50 hover:text-white"><X size={20} /></button>
                <div className="flex justify-center mb-6">
                    <div className={`p-6 rounded-full ${trainingStep === 0 ? 'bg-blue-500/20' : 'bg-red-500/20 animate-pulse'}`}>
                        <Mic size={40} className={trainingStep === 0 ? 'text-blue-400' : 'text-red-400'} />
                    </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">Quem está falando?</h2>
                <p className="text-white/50 mb-6 text-sm">Selecione o perfil para calibrar a saudação.</p>
                
                <div className="flex gap-4 justify-center">
                    <button onClick={() => setTrainingStep(1.1)} className="bg-white/5 hover:bg-white/10 p-4 rounded-xl w-32 border border-white/5 transition-colors">André</button>
                    <button onClick={() => setTrainingStep(1.2)} className="bg-white/5 hover:bg-white/10 p-4 rounded-xl w-32 border border-white/5 transition-colors">Marcelly</button>
                </div>
                
                {(trainingStep > 0 && trainingStep < 3) && (
                    <div className="mt-8">
                        <button onClick={handleVoiceTraining} className="bg-white text-black font-bold px-8 py-3 rounded-full hover:scale-105 transition-transform">
                            {trainingStep === 2 ? "Gravando..." : "Confirmar Voz"}
                        </button>
                    </div>
                )}
                {trainingStep === 3 && <div className="mt-6 text-green-400 font-bold">Salvo com sucesso!</div>}
            </div>
        </div>
      )}

      {/* Chef Modal */}
      {isChefOpen && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-fade-in">
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-6 w-full max-w-xl relative shadow-2xl flex flex-col h-[600px]">
                <button onClick={() => setIsChefOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white"><X /></button>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><ChefHat className="text-yellow-500" /> Chef IA</h2>
                
                <div className="flex-1 bg-black/30 rounded-2xl mb-4 p-6 overflow-y-auto border border-white/5 text-lg leading-relaxed">
                    {isChefLoading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-white/50">
                            <Sparkles className="animate-spin text-yellow-500" size={32} />
                            <p>Criando receita...</p>
                        </div>
                    ) : (
                        chefResponse || <span className="text-white/30 italic">"Diga os ingredientes que você tem na geladeira..."</span>
                    )}
                </div>
                
                <form onSubmit={handleAskChef} className="flex gap-2">
                    <input 
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-white/30 focus:outline-none focus:border-yellow-500/50 transition-colors" 
                        value={chefInput} 
                        onChange={e => setChefInput(e.target.value)} 
                        placeholder="Ex: Tenho ovos, batata e queijo..." 
                    />
                    <button className="bg-yellow-500 hover:bg-yellow-400 text-black p-4 rounded-xl transition-colors font-bold"><Send size={20} /></button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;