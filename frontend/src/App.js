import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, Square, Pause, Play, MoreHorizontal, Search, 
  Plus, Share, MessageSquare, Mail, Folder, Calendar, 
  User, Settings, X, ChevronLeft, Check, AlertCircle,
  FileText, Loader2, Download, Volume2, Wifi, WifiOff,
  PenTool, Layout, Clock
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

// --- Mock Data & Types ---
const MOCK_TRANSCRIPT = [
  { id: 1, speaker: 'Me', text: "Alright, let's kick off this review. I wanted to go over the quarterly numbers.", time: '00:02' },
  { id: 2, speaker: 'Client', text: "Sounds good. I've been looking at the report you sent yesterday.", time: '00:08' },
  { id: 3, speaker: 'Me', text: "Great. Specifically, I want to highlight the growth in the enterprise sector.", time: '00:15' },
  { id: 4, speaker: 'Client', text: "That jumped out at me too. A 40% increase is impressive.", time: '00:22' },
];

// States: IDLE, CONNECTING, RECORDING, PAUSED, BUFFERING, ERROR, STOPPED
const APP_STATES = {
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

  // Mock connection sequence
  const handleStartRecording = () => {
    setAppState(APP_STATES.CONNECTING);
    setTimeout(() => {
      setAppState(APP_STATES.RECORDING);
      setTranscript([]); // Clear previous
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

  return (
    <div className="flex h-screen w-full bg-[#FAFAFA] text-foreground overflow-hidden font-sans selection:bg-primary/20">
      {/* Sidebar (Optional/Collapsible) */}
      <div className={cn(
        "bg-white border-r border-border transition-all duration-300 ease-in-out flex flex-col",
        isSidebarOpen ? "w-64" : "w-0 opacity-0 overflow-hidden"
      )}>
        <div className="p-4 flex items-center gap-2 font-semibold text-lg text-primary">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <div className="w-4 h-4 bg-primary rounded-full" />
          </div>
          Notelytix
        </div>
        <div className="px-2 py-4 space-y-1">
          {['Home', 'Meetings', 'Notes', 'Recordings', 'Settings'].map((item) => (
            <Button key={item} variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              {item === 'Home' && <Layout className="mr-2 h-4 w-4" />}
              {item === 'Meetings' && <Calendar className="mr-2 h-4 w-4" />}
              {item === 'Notes' && <FileText className="mr-2 h-4 w-4" />}
              {item === 'Recordings' && <Mic className="mr-2 h-4 w-4" />}
              {item === 'Settings' && <Settings className="mr-2 h-4 w-4" />}
              {item}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Top Navigation */}
        <header className="h-[60px] bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-muted-foreground">
              {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <Layout className="h-5 w-5" />}
            </Button>
          </div>
          
          <div className="flex-1 max-w-md mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                className="pl-10 rounded-full bg-secondary/50 border-transparent hover:bg-secondary focus:bg-white transition-all" 
                placeholder="Search notes..." 
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full h-8 bg-white hover:bg-gray-50 hidden sm:flex">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Note
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground">
              <Share className="h-4 w-4" />
            </Button>
             <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground" onClick={() => setShowSettings(true)}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            <Avatar className="h-8 w-8 border border-border ml-2 cursor-pointer">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 relative">
          <div className="max-w-5xl mx-auto h-full flex flex-col">
            
            {/* Meeting Header */}
            <div className="text-center space-y-4 mb-10 animate-fade-in">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground outline-none" contentEditable suppressContentEditableWarning>
                {meetingTitle}
              </h1>
              <div className="flex items-center justify-center gap-3 text-sm">
                <Badge variant="secondary" className="rounded-full px-3 font-normal text-muted-foreground bg-white border border-border shadow-sm">
                  <Calendar className="h-3 w-3 mr-2" />
                  Today
                </Badge>
                 <Badge variant="secondary" className="rounded-full px-3 font-normal text-muted-foreground bg-white border border-border shadow-sm">
                  <User className="h-3 w-3 mr-2" />
                  Me
                </Badge>
                 <Badge variant="outline" className="rounded-full px-3 font-normal text-muted-foreground hover:bg-secondary cursor-pointer border-dashed">
                  <Folder className="h-3 w-3 mr-2" />
                  Add to folder
                </Badge>
              </div>
            </div>

            {/* Dynamic Content Based on State */}
            <div className="flex-1 flex gap-8 min-h-0">
              {/* Left Column: Transcript (Visible when Recording/Stopped) */}
              {(appState === APP_STATES.RECORDING || appState === APP_STATES.PAUSED || appState === APP_STATES.STOPPED || appState === APP_STATES.CONNECTING) && (
                 <div className={cn(
                   "flex-1 flex flex-col transition-all duration-500",
                   showSummary ? "w-1/2" : "w-full"
                 )}>
                    {/* Live Transcript Feed */}
                    <div className="bg-white rounded-2xl border border-border shadow-sm flex-1 overflow-hidden flex flex-col relative">
                       {appState === APP_STATES.RECORDING && (
                         <div className="bg-green-50/50 border-b border-green-100 px-4 py-2 flex items-center justify-between text-xs text-green-800">
                            <span className="flex items-center"><Wifi className="h-3 w-3 mr-2" /> Live Transcription Active</span>
                            <span>00:45</span>
                         </div>
                       )}
                       
                       {appState === APP_STATES.CONNECTING && (
                         <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                            <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                            <p className="text-sm text-muted-foreground font-medium">Connecting to transcription service...</p>
                         </div>
                       )}

                       {appState === APP_STATES.PAUSED && (
                         <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
                            <div className="bg-white px-6 py-4 rounded-xl shadow-lg border border-border text-center">
                              <Pause className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                              <h3 className="font-medium text-foreground">Transcript Paused</h3>
                              <p className="text-sm text-muted-foreground">Recording is temporarily paused</p>
                            </div>
                         </div>
                       )}

                       <ScrollArea className="flex-1 p-6">
                          <div className="space-y-6">
                             {transcript.length === 0 && appState !== APP_STATES.CONNECTING && (
                               <div className="text-center text-muted-foreground py-20">
                                 <p>Start speaking to see transcript...</p>
                               </div>
                             )}
                             {[...MOCK_TRANSCRIPT, ...transcript].map((line, idx) => (
                               <div key={idx} className="group flex gap-4 hover:bg-secondary/30 p-2 -mx-2 rounded-lg transition-colors cursor-text">
                                  <div className="w-12 shrink-0 text-xs text-muted-foreground pt-1 text-right font-mono opacity-50 group-hover:opacity-100 transition-opacity">{line.time}</div>
                                  <div className="flex-1">
                                     <div className="text-xs font-medium text-primary mb-0.5">{line.speaker}</div>
                                     <p className="text-base leading-relaxed text-foreground/90">{line.text}</p>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </ScrollArea>
                    </div>
                 </div>
              )}

              {/* Right Column: Editor / Summary */}
              {(appState === APP_STATES.IDLE || appState === APP_STATES.RECORDING || appState === APP_STATES.STOPPED) && !showSummary && (
                <div className={cn(
                  "flex flex-col transition-all duration-500",
                  appState === APP_STATES.IDLE ? "w-full" : "hidden lg:flex w-1/2 border-l border-dashed border-border pl-8"
                )}>
                   <div className="h-full relative group cursor-text">
                      <div 
                        className="w-full h-full outline-none text-lg leading-relaxed text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40" 
                        contentEditable
                        data-placeholder={appState === APP_STATES.IDLE ? "Write notes..." : "AI Notes will appear here after the call ends..."}
                      />
                   </div>
                </div>
              )}

              {/* Summary Panel (Slide-in) */}
              {showSummary && (
                <div className="w-1/2 bg-white rounded-2xl border border-border shadow-lg flex flex-col animate-slide-in-right overflow-hidden">
                   <div className="p-4 border-b border-border flex items-center justify-between bg-gray-50/50">
                      <h3 className="font-semibold flex items-center text-primary"><PenTool className="h-4 w-4 mr-2" /> AI Summary</h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowSummary(false)}><X className="h-4 w-4" /></Button>
                   </div>
                   <ScrollArea className="flex-1 p-6">
                      <div className="space-y-6">
                        <section>
                          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Key Points</h4>
                          <ul className="list-disc list-outside ml-4 space-y-2 text-sm text-foreground/90">
                             <li>Quarterly growth in enterprise sector exceeded 40%.</li>
                             <li>Client impressed with the latest report metrics.</li>
                             <li>Q3 projections need to be updated by Friday.</li>
                          </ul>
                        </section>
                        <Separator />
                         <section>
                          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Action Items</h4>
                          <div className="space-y-2">
                             <div className="flex items-start gap-2">
                                <div className="h-4 w-4 rounded border border-primary mt-0.5 flex items-center justify-center"><Check className="h-3 w-3 text-primary" /></div>
                                <span className="text-sm line-through text-muted-foreground">Send updated report PDF</span>
                             </div>
                              <div className="flex items-start gap-2">
                                <div className="h-4 w-4 rounded border border-muted-foreground mt-0.5"></div>
                                <span className="text-sm">Schedule follow-up for next Tuesday</span>
                             </div>
                          </div>
                        </section>
                      </div>
                   </ScrollArea>
                   <div className="p-4 border-t border-border bg-gray-50/50 flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-8">Copy</Button>
                      <Button size="sm" className="text-xs h-8">Share</Button>
                   </div>
                </div>
              )}

            </div>
          </div>
        </main>

        {/* Bottom Floating Control Bar */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
           <div className="bg-white/90 backdrop-blur-lg border border-border/50 shadow-xl rounded-full p-2 flex items-center gap-3 pl-3 pr-3 ring-1 ring-black/5 transition-all hover:scale-105">
              
              {appState === APP_STATES.IDLE && (
                <Button 
                  size="lg" 
                  className="rounded-full px-8 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 h-12"
                  onClick={handleStartRecording}
                >
                  <Mic className="h-5 w-5 mr-2" />
                  Start
                </Button>
              )}

              {appState === APP_STATES.CONNECTING && (
                 <Button disabled size="lg" className="rounded-full px-8 bg-muted text-muted-foreground h-12">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Connecting...
                 </Button>
              )}

              {(appState === APP_STATES.RECORDING || appState === APP_STATES.PAUSED) && (
                 <>
                   <Button 
                      variant="outline"
                      size="icon" 
                      className="rounded-full h-12 w-12 border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                      onClick={handleStopRecording}
                    >
                      <Square className="h-5 w-5 fill-current" />
                   </Button>
                   
                   <Button 
                      size="lg" 
                      className="rounded-full px-8 bg-foreground text-background hover:bg-foreground/90 h-12 min-w-[140px]"
                      onClick={appState === APP_STATES.RECORDING ? handlePauseRecording : handleResumeRecording}
                    >
                      {appState === APP_STATES.RECORDING ? (
                        <><Pause className="h-5 w-5 mr-2" /> Pause</>
                      ) : (
                        <><Play className="h-5 w-5 mr-2" /> Resume</>
                      )}
                    </Button>
                 </>
              )}

               {appState === APP_STATES.STOPPED && (
                 <Button 
                    size="lg" 
                    className="rounded-full px-8 bg-primary hover:bg-primary/90 text-white h-12 animate-pulse-slow"
                    onClick={handleGenerateSummary}
                  >
                    <PenTool className="h-5 w-5 mr-2" />
                    Generate Summary
                  </Button>
               )}

              <div className="h-8 w-px bg-border mx-1"></div>

              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary h-10 px-4">
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask AI
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary h-10 px-4">
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
           </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="space-y-3">
                <Label>Audio Format</Label>
                <RadioGroup defaultValue="opus">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pcm" id="pcm" />
                    <Label htmlFor="pcm">PCM16 (Uncompressed)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="opus" id="opus" />
                    <Label htmlFor="opus">Opus (Optimized)</Label>
                  </div>
                </RadioGroup>
             </div>
             <Separator />
             <div className="space-y-3">
                <Label>Sample Rate</Label>
                <Select defaultValue="16k">
                  <SelectTrigger>
                    <SelectValue placeholder="Select rate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16k">16 kHz</SelectItem>
                    <SelectItem value="32k">32 kHz</SelectItem>
                    <SelectItem value="48k">48 kHz</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             <Separator />
             <div className="space-y-2">
                <Label>Loopback Audio (System Audio)</Label>
                <div className="bg-secondary/50 p-3 rounded-lg text-xs text-muted-foreground space-y-2">
                   <div className="font-medium text-foreground flex items-center"><Volume2 className="h-3 w-3 mr-2" /> macOS Instructions</div>
                   <p>Install BlackHole or use iShowU Audio Capture to route system audio.</p>
                </div>
             </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Toaster position="top-center" />
    </div>
  );
}
