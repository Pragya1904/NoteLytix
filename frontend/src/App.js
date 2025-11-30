import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, Square, Pause, Play, MoreHorizontal, Search, 
  Plus, Share, MessageSquare, Mail, Folder, Calendar, 
  User, Settings, X, ChevronLeft, Check, AlertCircle,
  FileText, Loader2, Download, Volume2, Wifi, WifiOff,
  PenTool, Layout, Clock, AlertTriangle, LogOut, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

// --- Mock Data & Types ---
const MOCK_TRANSCRIPT = [
  { id: 1, speaker: 'Me', text: "Alright, let's kick off this review. I wanted to go over the quarterly numbers.", time: '00:02' },
  { id: 2, speaker: 'Client', text: "Sounds good. I've been looking at the report you sent yesterday.", time: '00:08' },
  { id: 3, speaker: 'Me', text: "Great. Specifically, I want to highlight the growth in the enterprise sector.", time: '00:15' },
  { id: 4, speaker: 'Client', text: "That jumped out at me too. A 40% increase is impressive.", time: '00:22' },
];

// States
const APP_STATES = {
  SIGNIN: 'SIGNIN',
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  BUFFERING: 'BUFFERING',
  ERROR: 'ERROR',
  STOPPED: 'STOPPED',
};

export default function NotelytixApp() {
  const [appState, setAppState] = useState(APP_STATES.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("Untitled meeting");
  
  // Simulation for transcript generation
  useEffect(() => {
    let interval;
    if (appState === APP_STATES.RECORDING) {
      interval = setInterval(() => {
        // Add a new mock line occasionally
        if (Math.random() > 0.6) {
          const newId = Date.now();
          setTranscript(prev => [
            ...prev, 
            { 
              id: newId, 
              speaker: Math.random() > 0.5 ? 'Me' : 'Client', 
              text: "This is a simulated live transcription line showing real-time updates...", 
              time: '00:' + Math.floor(Math.random() * 60).toString().padStart(2, '0')
            }
          ]);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [appState]);

  // Handlers
  const handleStartRecording = () => {
    setAppState(APP_STATES.CONNECTING);
    setTimeout(() => {
      setAppState(APP_STATES.RECORDING);
      setTranscript([]);
      toast.success("Recording started");
    }, 2000);
  };

  const handleStopRecording = () => {
    setAppState(APP_STATES.STOPPED);
    toast.success("Recording saved");
  };

  const handlePauseRecording = () => {
    setAppState(APP_STATES.PAUSED);
  };
  
  const handleResumeRecording = () => {
    setAppState(APP_STATES.RECORDING);
  };

  const handleGenerateSummary = () => {
    setShowSummary(true);
  };

  const handleLogin = () => {
    setAppState(APP_STATES.IDLE);
  };

  const handleSignOut = () => {
    setAppState(APP_STATES.SIGNIN);
  }

  // --- Render Sign In State ---
  if (appState === APP_STATES.SIGNIN) {
    return (
      <div className="flex h-screen w-full bg-[#FAFAFA] items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-border p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <div className="w-8 h-8 bg-primary rounded-full" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Notelytix</h1>
          <p className="text-muted-foreground">Sign in to start capturing your meetings.</p>
          
          <Button size="lg" className="w-full rounded-full h-12 text-base bg-white border border-border text-foreground hover:bg-gray-50 shadow-sm" onClick={handleLogin}>
             <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
             </svg>
             Continue with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#FAFAFA] text-foreground overflow-hidden font-sans selection:bg-primary/20">
      {/* Sidebar */}
      <div className={cn(
        "bg-white border-r border-border transition-all duration-300 ease-in-out flex flex-col z-20 shadow-lg absolute inset-y-0 left-0 lg:relative lg:shadow-none",
        isSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full lg:w-0 lg:translate-x-0 lg:opacity-0 lg:overflow-hidden lg:border-none"
      )}>
        <div className="p-6 flex items-center justify-between font-semibold text-lg text-primary">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
               <div className="w-4 h-4 bg-primary rounded-full" />
             </div>
             Notelytix
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-3 py-2 space-y-1">
          {['Home', 'Meetings', 'Notes', 'Recordings', 'Settings'].map((item) => (
            <Button key={item} variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 rounded-lg">
              {item === 'Home' && <Layout className="mr-3 h-4 w-4" />}
              {item === 'Meetings' && <Calendar className="mr-3 h-4 w-4" />}
              {item === 'Notes' && <FileText className="mr-3 h-4 w-4" />}
              {item === 'Recordings' && <Mic className="mr-3 h-4 w-4" />}
              {item === 'Settings' && <Settings className="mr-3 h-4 w-4" />}
              {item}
            </Button>
          ))}
        </div>
        <div className="mt-auto p-4 border-t border-border">
            <div className="bg-secondary/50 rounded-lg p-3 flex items-center gap-3">
                <Avatar className="h-8 w-8">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">Jane Doe</p>
                    <p className="text-xs text-muted-foreground truncate">jane@example.com</p>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-[#FAFAFA]">
        {/* Top Navigation */}
        <header className="h-[60px] bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-muted-foreground hover:bg-secondary rounded-full">
              {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <Layout className="h-5 w-5" />}
            </Button>
          </div>
          
          <div className="flex-1 max-w-md mx-auto">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <Input 
                className="pl-10 rounded-full bg-secondary/30 border-transparent hover:bg-secondary focus:bg-white focus:ring-1 focus:ring-primary/20 transition-all" 
                placeholder="Search notes..." 
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full h-8 bg-white hover:bg-gray-50 hidden sm:flex border-dashed text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Note
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5">
              <Share className="h-4 w-4" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <Settings className="mr-2 h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Debug: Force State</DropdownMenuLabel>
                {Object.values(APP_STATES).map(state => (
                   <DropdownMenuItem key={state} onClick={() => setAppState(state)} className="text-xs font-mono">
                      {state}
                   </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Avatar className="h-8 w-8 border border-border ml-2 cursor-pointer transition-transform hover:scale-105" onClick={() => setAppState(APP_STATES.SIGNIN)}>
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </div>
        </header>
        
        {/* Beta Banner (Visible when Recording) */}
        {appState === APP_STATES.RECORDING && (
            <div className="bg-emerald-50/60 border-b border-emerald-100 px-4 py-1.5 text-center text-xs font-medium text-emerald-800 flex items-center justify-center animate-fade-in">
                <Shield className="h-3 w-3 mr-2" />
                Echo cancellation is in beta on Windows.
            </div>
        )}
        
        {/* Buffering Banner */}
        {appState === APP_STATES.BUFFERING && (
            <div className="bg-yellow-50 border-b border-yellow-100 px-4 py-1.5 text-center text-xs font-medium text-yellow-800 flex items-center justify-center animate-pulse">
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                Sending audio... hold on
            </div>
        )}

        {/* Main Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 relative">
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            
            {/* Meeting Header */}
            <div className="text-center space-y-4 mb-8 animate-fade-in shrink-0">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground outline-none" contentEditable suppressContentEditableWarning>
                {meetingTitle}
              </h1>
              <div className="flex items-center justify-center gap-3 text-sm">
                <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal text-muted-foreground bg-white border border-border shadow-sm hover:bg-secondary/80">
                  <Calendar className="h-3 w-3 mr-2" />
                  Today
                </Badge>
                 <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal text-muted-foreground bg-white border border-border shadow-sm hover:bg-secondary/80">
                  <User className="h-3 w-3 mr-2" />
                  Me
                </Badge>
                 <Badge variant="outline" className="rounded-full px-3 py-1 font-normal text-muted-foreground hover:bg-secondary cursor-pointer border-dashed border-border transition-colors">
                  <Folder className="h-3 w-3 mr-2" />
                  Add to folder
                </Badge>
              </div>
            </div>

            {/* Error State Panel */}
            {appState === APP_STATES.ERROR && (
                <div className="flex-1 flex items-center justify-center animate-fade-in">
                    <div className="bg-white rounded-2xl p-8 shadow-xl border border-red-100 max-w-md w-full text-center space-y-4 relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" />
                        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-2">
                            <AlertTriangle className="h-6 w-6 text-red-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">Service is currently busy</h3>
                        <p className="text-muted-foreground">Our transcription provider is temporarily overloaded. Please try again in a few moments.</p>
                        <div className="pt-4 flex flex-col gap-2">
                            <Button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg" onClick={() => setAppState(APP_STATES.IDLE)}>Retry now</Button>
                            <Button variant="link" className="text-red-600 text-xs">Report this issue</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dynamic Content Columns */}
            {appState !== APP_STATES.ERROR && (
            <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
              {/* Left Column: Transcript */}
              {(appState === APP_STATES.RECORDING || appState === APP_STATES.PAUSED || appState === APP_STATES.STOPPED || appState === APP_STATES.CONNECTING || appState === APP_STATES.BUFFERING) && (
                 <div className={cn(
                   "flex-1 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                   showSummary ? "lg:w-1/2" : "w-full"
                 )}>
                    <div className="bg-white rounded-2xl border border-border shadow-sm flex-1 overflow-hidden flex flex-col relative">
                       
                       {/* Header for Transcript Box */}
                       <div className="px-4 py-3 border-b border-border bg-gray-50/30 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <div className={cn("w-2 h-2 rounded-full", appState === APP_STATES.RECORDING ? "bg-red-500 animate-pulse" : "bg-gray-300")} />
                             <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {appState === APP_STATES.RECORDING ? 'Live' : 'Transcript'}
                             </span>
                          </div>
                          {appState === APP_STATES.STOPPED && (
                              <div className="flex gap-2">
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"><Download className="h-3 w-3 mr-1" /> Audio</Button>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"><Download className="h-3 w-3 mr-1" /> Text</Button>
                              </div>
                          )}
                       </div>

                       {appState === APP_STATES.CONNECTING && (
                         <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                            <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
                            <p className="text-sm text-muted-foreground font-medium">Connecting to transcription service...</p>
                         </div>
                       )}

                       {appState === APP_STATES.PAUSED && (
                         <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center animate-fade-in">
                            <div className="bg-white px-8 py-6 rounded-2xl shadow-xl border border-border text-center transform transition-all scale-100">
                              <Pause className="h-10 w-10 text-primary mx-auto mb-3 bg-primary/10 p-2 rounded-full" />
                              <h3 className="font-semibold text-foreground text-lg">Transcript Paused</h3>
                              <p className="text-sm text-muted-foreground mt-1">Recording is temporarily paused</p>
                            </div>
                         </div>
                       )}

                       <ScrollArea className="flex-1 p-6">
                          <div className="space-y-6 pb-20">
                             {transcript.length === 0 && appState !== APP_STATES.CONNECTING && (
                               <div className="text-center text-muted-foreground py-20 flex flex-col items-center">
                                 <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3">
                                    <Mic className="h-5 w-5 text-muted-foreground" />
                                 </div>
                                 <p>Start speaking to see transcript...</p>
                               </div>
                             )}
                             {[...MOCK_TRANSCRIPT, ...transcript].map((line, idx) => (
                               <div key={idx} className="group flex gap-4 hover:bg-secondary/40 p-3 -mx-3 rounded-xl transition-all cursor-text">
                                  <div className="w-14 shrink-0 text-xs text-muted-foreground pt-1 text-right font-mono opacity-40 group-hover:opacity-100 transition-opacity">{line.time}</div>
                                  <div className="flex-1">
                                     <div className="flex items-center gap-2 mb-1">
                                         <div className="text-xs font-semibold text-primary bg-primary/5 px-1.5 py-0.5 rounded">{line.speaker}</div>
                                     </div>
                                     <p className="text-[15px] leading-relaxed text-foreground/80 selection:bg-primary/20">{line.text}</p>
                                  </div>
                               </div>
                             ))}
                             {/* Ghost element for auto-scroll */}
                             <div className="h-4" /> 
                          </div>
                       </ScrollArea>
                    </div>
                 </div>
              )}

              {/* Right Column: Editor / Summary */}
              {(appState === APP_STATES.IDLE || appState === APP_STATES.RECORDING || appState === APP_STATES.STOPPED || appState === APP_STATES.BUFFERING) && !showSummary && (
                <div className={cn(
                  "flex flex-col transition-all duration-500",
                  appState === APP_STATES.IDLE ? "w-full" : "hidden lg:flex lg:w-1/2 lg:border-l lg:border-dashed lg:border-border lg:pl-8"
                )}>
                   <div className="h-full relative group cursor-text p-1">
                      <div 
                        className="w-full h-full outline-none text-lg leading-relaxed text-foreground/80 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 placeholder-shown:text-muted-foreground" 
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder={appState === APP_STATES.IDLE ? "Type here to take notes..." : "AI Notes will appear here after the call ends..."}
                      />
                   </div>
                </div>
              )}

              {/* Summary Panel (Slide-in) */}
              {showSummary && (
                <div className="lg:w-1/2 w-full bg-white rounded-2xl border border-border shadow-xl shadow-gray-200/50 flex flex-col animate-slide-in-right overflow-hidden relative">
                   <div className="p-4 border-b border-border flex items-center justify-between bg-gray-50/50">
                      <h3 className="font-semibold flex items-center text-primary"><PenTool className="h-4 w-4 mr-2" /> AI Summary</h3>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowSummary(false)}><X className="h-4 w-4" /></Button>
                   </div>
                   <ScrollArea className="flex-1 p-6 bg-white/50">
                      <div className="space-y-8">
                        <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center">
                            <span className="w-1 h-4 bg-primary rounded-full mr-2"></span>
                            Key Points
                          </h4>
                          <ul className="space-y-3">
                             <li className="text-sm leading-relaxed text-foreground/90 flex gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0"></span>
                                Quarterly growth in enterprise sector exceeded 40%, driven by new strategic partnerships.
                             </li>
                             <li className="text-sm leading-relaxed text-foreground/90 flex gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0"></span>
                                Client impressed with the latest report metrics and requested specific breakdown of Q2 vs Q3.
                             </li>
                          </ul>
                        </section>
                        
                        <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center">
                            <span className="w-1 h-4 bg-orange-400 rounded-full mr-2"></span>
                            Action Items
                          </h4>
                          <div className="space-y-3">
                             <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
                                <div className="h-5 w-5 rounded-full border-2 border-primary/20 flex items-center justify-center shrink-0 cursor-pointer hover:bg-primary hover:border-primary transition-colors group">
                                    <Check className="h-3 w-3 text-white opacity-0 group-hover:opacity-100" />
                                </div>
                                <span className="text-sm font-medium text-foreground/90 pt-0.5">Send updated report PDF by EOD</span>
                             </div>
                             <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
                                <div className="h-5 w-5 rounded-full border-2 border-primary/20 flex items-center justify-center shrink-0 cursor-pointer hover:bg-primary hover:border-primary transition-colors group">
                                    <Check className="h-3 w-3 text-white opacity-0 group-hover:opacity-100" />
                                </div>
                                <span className="text-sm font-medium text-foreground/90 pt-0.5">Schedule follow-up for next Tuesday</span>
                             </div>
                          </div>
                        </section>
                      </div>
                   </ScrollArea>
                   <div className="p-4 border-t border-border bg-gray-50/50 flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-8 rounded-lg bg-white">Copy Text</Button>
                      <Button size="sm" className="text-xs h-8 rounded-lg bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">Share Summary</Button>
                   </div>
                </div>
              )}

            </div>
            )}
          </div>
        </main>

        {/* Bottom Floating Control Bar - Visible when not in Error */}
        {appState !== APP_STATES.ERROR && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 max-w-[90vw]">
           <div className="bg-white/90 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/5 rounded-full p-1.5 flex items-center gap-2 pl-2 pr-2 ring-1 ring-black/5 transition-all hover:scale-[1.02] duration-300">
              
              {appState === APP_STATES.IDLE && (
                <Button 
                  size="lg" 
                  className="rounded-full px-8 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30 h-12 font-medium transition-all hover:shadow-primary/40"
                  onClick={handleStartRecording}
                >
                  <Mic className="h-5 w-5 mr-2" />
                  Start Recording
                </Button>
              )}

              {(appState === APP_STATES.CONNECTING || appState === APP_STATES.BUFFERING) && (
                 <Button disabled size="lg" className="rounded-full px-8 bg-secondary text-muted-foreground h-12 opacity-80">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    {appState === APP_STATES.BUFFERING ? 'Sending...' : 'Connecting...'}
                 </Button>
              )}

              {(appState === APP_STATES.RECORDING || appState === APP_STATES.PAUSED) && (
                 <>
                   <Button 
                      variant="outline"
                      size="icon" 
                      className="rounded-full h-12 w-12 border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-200 transition-colors"
                      onClick={handleStopRecording}
                    >
                      <Square className="h-5 w-5 fill-current" />
                   </Button>
                   
                   <Button 
                      size="lg" 
                      className={cn(
                          "rounded-full px-8 h-12 min-w-[140px] transition-all",
                          appState === APP_STATES.PAUSED 
                            ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" 
                            : "bg-foreground text-background hover:bg-foreground/90"
                      )}
                      onClick={appState === APP_STATES.RECORDING ? handlePauseRecording : handleResumeRecording}
                    >
                      {appState === APP_STATES.RECORDING ? (
                        <><Pause className="h-5 w-5 mr-2" /> Pause</>
                      ) : (
                        <><Play className="h-5 w-5 mr-2 fill-current" /> Resume</>
                      )}
                    </Button>
                 </>
              )}

               {appState === APP_STATES.STOPPED && (
                 <Button 
                    size="lg" 
                    className="rounded-full px-8 bg-primary hover:bg-primary/90 text-white h-12 animate-pulse-slow shadow-lg shadow-primary/30"
                    onClick={handleGenerateSummary}
                  >
                    <PenTool className="h-5 w-5 mr-2" />
                    Generate Summary
                  </Button>
               )}

              {appState !== APP_STATES.CONNECTING && appState !== APP_STATES.BUFFERING && (
                  <>
                      <div className="h-8 w-px bg-border mx-1"></div>

                      <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 h-10 px-4 transition-colors">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Ask AI
                      </Button>
                      <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 h-10 px-4 transition-colors">
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </Button>
                  </>
              )}
           </div>
        </div>
        )}
      </div>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[450px] p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-gray-50/50">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Configure your audio and transcription preferences.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-6">
             <div className="space-y-4">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Audio Format</Label>
                <RadioGroup defaultValue="opus" className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2 border border-border p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                    <RadioGroupItem value="pcm" id="pcm" />
                    <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="pcm" className="font-semibold cursor-pointer">PCM16</Label>
                        <p className="text-xs text-muted-foreground">Uncompressed (High Quality)</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 border border-border p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                    <RadioGroupItem value="opus" id="opus" />
                     <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="opus" className="font-semibold cursor-pointer">Opus</Label>
                        <p className="text-xs text-muted-foreground">Optimized (Low Bandwidth)</p>
                    </div>
                  </div>
                </RadioGroup>
             </div>
             
             <div className="space-y-4">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Sample Rate</Label>
                <Select defaultValue="16k">
                  <SelectTrigger className="w-full h-11 rounded-xl">
                    <SelectValue placeholder="Select rate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16k">16 kHz (Speech Standard)</SelectItem>
                    <SelectItem value="32k">32 kHz (High Quality)</SelectItem>
                    <SelectItem value="48k">48 kHz (Studio)</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             
             <div className="space-y-4">
                <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Loopback Audio</Label>
                <div className="bg-secondary/30 border border-border p-4 rounded-xl space-y-3">
                   <div className="flex items-center justify-between">
                        <div className="font-medium text-foreground flex items-center text-sm"><Volume2 className="h-4 w-4 mr-2 text-primary" /> macOS Instructions</div>
                        <Badge variant="outline" className="text-[10px]">Required</Badge>
                   </div>
                   <p className="text-xs text-muted-foreground leading-relaxed">
                     To capture system audio on macOS, you need to install <strong>BlackHole</strong> or use <strong>iShowU Audio Capture</strong>.
                   </p>
                   <Button variant="link" className="h-auto p-0 text-xs text-primary">View setup guide</Button>
                </div>
             </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border bg-gray-50/50">
            <Button variant="outline" onClick={() => setShowSettings(false)} className="rounded-lg">Cancel</Button>
            <Button onClick={() => setShowSettings(false)} className="rounded-lg bg-primary text-white hover:bg-primary/90">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Toaster position="top-center" />
    </div>
  );
}
