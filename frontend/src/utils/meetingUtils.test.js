import { groupMeetingsByDate } from './meetingUtils.js';

describe('groupMeetingsByDate', () => {
    const meetings = [
        { id: 1, title: 'Meeting A', created_on: '2026-01-10T10:00:00Z' },
        { id: 2, title: 'Meeting B', created_on: '2026-01-10T14:00:00Z' },
        { id: 3, title: 'Meeting C', created_on: '2026-01-09T09:00:00Z' }
    ];

    it('should group meetings by date and sort latest first', () => {
        const groups = groupMeetingsByDate(meetings);
        expect(groups.length).toBe(2);
        expect(groups[0][0]).toContain('Jan 10, 2026'); // Depends on locale, but checking existence
        expect(groups[1][0]).toContain('Jan 9, 2026');
    });
});
