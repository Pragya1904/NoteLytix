export const groupMeetingsByDate = (meetings) => {
    const groups = {};
    meetings.forEach(m => {
        const date = new Date(m.created_on).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });
        if (!groups[date]) groups[date] = [];
        groups[date].push(m);
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
};
