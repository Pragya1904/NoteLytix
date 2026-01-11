import React, { useState, useEffect } from 'react';
import { PenTool } from 'lucide-react';

/**
 * MeetingNotes Component
 * A reusable component for writing custom meeting notes.
 */
export const MeetingNotes = ({ initialNotes, onSave, placeholder = "Type your custom meeting notes here..." }) => {
    const [notes, setNotes] = useState(initialNotes || '');

    useEffect(() => {
        setNotes(initialNotes || '');
    }, [initialNotes]);

    const handleChange = (e) => {
        const newNotes = e.target.value;
        setNotes(newNotes);
        if (onSave) {
            onSave(newNotes);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-gray-50/30 flex items-center gap-2">
                <PenTool className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custom Notes</span>
            </div>
            <textarea
                className="flex-1 w-full p-6 text-base leading-relaxed text-foreground/80 outline-none resize-none placeholder:text-muted-foreground/40 bg-transparent"
                value={notes}
                onChange={handleChange}
                placeholder={placeholder}
            />
        </div>
    );
};

export default MeetingNotes;
