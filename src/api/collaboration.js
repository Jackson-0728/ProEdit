import { supabase } from './supabase.js';

export class CollaborationManager {
    constructor(docId, currentUser, callbacks) {
        this.docId = docId;
        this.currentUser = currentUser;
        this.callbacks = callbacks || {};
        this.channel = null;
        this.presences = {};

        // Default callbacks
        this.onPresenceUpdate = this.callbacks.onPresenceUpdate || (() => { });
        this.onCursorUpdate = this.callbacks.onCursorUpdate || (() => { });
        this.onChatMessage = this.callbacks.onChatMessage || (() => { });

        this.init();
    }

    async init() {
        if (!this.docId || !this.currentUser) return;

        // Create a unique channel for this document
        this.channel = supabase.channel(`doc:${this.docId}`, {
            config: {
                presence: {
                    key: this.currentUser.id,
                },
            },
        });

        this.channel
            // Handle Presence (Who is online)
            .on('presence', { event: 'sync' }, () => {
                const state = this.channel.presenceState();
                this.presences = state;
                this.notifyPresenceUpdate();
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('User joined:', key, newPresences);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('User left:', key, leftPresences);
            })

            // Handle Broadcasts (Cursors, Chat)
            .on('broadcast', { event: 'cursor' }, ({ payload }) => {
                // payload = { userId, color, range: { index, length }, coordinates ... }
                if (payload.userId !== this.currentUser.id) {
                    this.onCursorUpdate(payload);
                }
            })
            .on('broadcast', { event: 'chat' }, ({ payload }) => {
                // payload = { userId, userEmail, message, role, timestamp }
                this.onChatMessage(payload);
            })

            // Subscribe to the channel
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Track our own presence
                    await this.channel.track({
                        user_id: this.currentUser.id,
                        email: this.currentUser.email,
                        online_at: new Date().toISOString(),
                    });
                }
            });
    }

    // --- Actions ---

    async sendCursor(range, coordinates) {
        if (!this.channel) return;

        // We assign a color deterministically based on user ID for consistency
        const color = this.getColorForUser(this.currentUser.id);

        await this.channel.send({
            type: 'broadcast',
            event: 'cursor',
            payload: {
                userId: this.currentUser.id,
                userEmail: this.currentUser.email,
                color: color,
                range: range,
                coordinates: coordinates // { top, left, height }
            },
        });
    }

    async sendChat(message, role = 'viewer') {
        if (!this.channel) return;

        const payload = {
            userId: this.currentUser.id,
            userEmail: this.currentUser.email,
            message: message,
            role: role,
            timestamp: new Date().toISOString()
        };

        // Optimistically show our own message
        this.onChatMessage(payload);

        await this.channel.send({
            type: 'broadcast',
            event: 'chat',
            payload: payload
        });
    }

    leave() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }

    // --- Helpers ---

    notifyPresenceUpdate() {
        // Transform presence state object into a flat list of users
        // state = { 'user_id': [ { user_id, email, ... } ] }
        const users = [];
        Object.keys(this.presences).forEach(key => {
            const presence = this.presences[key][0]; // Take the first presence for this user
            if (presence) {
                users.push({
                    ...presence,
                    color: this.getColorForUser(presence.user_id)
                });
            }
        });
        this.onPresenceUpdate(users);
    }

    getColorForUser(userId) {
        const colors = [
            '#ef4444', // Red 500
            '#f97316', // Orange 500
            '#f59e0b', // Amber 500
            '#84cc16', // Lime 500
            '#10b981', // Emerald 500
            '#06b6d4', // Cyan 500
            '#3b82f6', // Blue 500
            '#8b5cf6', // Violet 500
            '#d946ef', // Fuchsia 500
            '#f43f5e', // Rose 500
        ];

        // Simple hash to pick a color
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    }
}
