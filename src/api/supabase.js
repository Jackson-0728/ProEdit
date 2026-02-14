import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    return { data, error };
}

export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    return { data, error };
}

export async function signInWithProvider(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin
        }
    });
    return { data, error };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

// Ensure 'supabase' client is imported and initialized correctly elsewhere in your project.
// import { supabase } from './supabaseClient'; // Example import

export async function resetPassword(email) {
    const configuredRedirect = import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL;
    const redirectTo = configuredRedirect || `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    });

    if (error) {
        console.error('Password reset email error:', error.message);
        return { success: false, error };
    } else {
        console.log('Password reset email sent successfully.');
        return { success: true, error: null };
    }
}

export async function getUser() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
}

export async function submitFeedback(name, email, rating, message) {
    const { data, error } = await supabase
        .from('proedit_feedback')
        .insert([
            { name, email, rating, message }
        ]);
    return { data, error };
}

// --- DOCUMENT CRUD OPERATIONS ---

export async function getDocuments() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        return { data: [], error: null };
    }

    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });
    return { data, error };
}

export async function getPublicDocument(id) {
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('is_public', true)
        .single();
    return { data, error };
}

export async function createDocument(doc) {
    const { data, error } = await supabase
        .from('documents')
        .insert([doc])
        .select()
        .single();
    return { data, error };
}

export async function updateDocument(id, updates) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        return { data: null, error: new Error('Not authenticated') };
    }

    const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', id)
        .eq('user_id', session.user.id)
        .select()
        .single();
    return { data, error };
}

export async function deleteDocument(id) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        return { error: new Error('Not authenticated') };
    }

    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);
    return { error };
}


// --- SHARING & PERMISSIONS ---

async function sendShareInviteEmail({ documentId, recipientEmail, role, docTitle, docLink }) {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
        return { data: null, error: new Error('Not authenticated') };
    }

    try {
        const response = await fetch('/api/share-invite-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                documentId,
                recipientEmail,
                role,
                docTitle,
                docLink
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                data: null,
                error: new Error(payload?.error || 'Failed to send invitation email')
            };
        }

        return { data: payload, error: null };
    } catch (error) {
        return { data: null, error };
    }
}

export async function shareDocument(docId, userEmail, role, options = {}) {
    const normalizedEmail = String(userEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
        return { data: null, error: new Error('Email is required'), emailError: null };
    }

    // Check if permission already exists
    const { data: existing } = await supabase
        .from('document_permissions')
        .select('*')
        .eq('document_id', docId)
        .eq('user_email', normalizedEmail)
        .single();

    let result;
    if (existing) {
        // Update role
        result = await supabase
            .from('document_permissions')
            .update({ role })
            .eq('id', existing.id);
    } else {
        // Insert new
        result = await supabase
            .from('document_permissions')
            .insert([{ document_id: docId, user_email: normalizedEmail, role }]);
    }

    let emailError = null;
    if (!result.error && options.sendEmail) {
        const { error } = await sendShareInviteEmail({
            documentId: docId,
            recipientEmail: normalizedEmail,
            role,
            docTitle: options.docTitle || 'Untitled Document',
            docLink: options.docLink || `${window.location.origin}?doc=${docId}`
        });

        if (error) emailError = error;
    }

    return { data: result.data || null, error: result.error || null, emailError };
}

export async function getDocumentPermissions(docId) {
    const { data, error } = await supabase
        .from('document_permissions')
        .select('*')
        .eq('document_id', docId);
    return { data, error };
}

export async function getSharedDocuments() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) return { data: [], error: null };

    // Get doc IDs shared with me
    const { data: perms } = await supabase
        .from('document_permissions')
        .select('document_id, role')
        .eq('user_email', session.user.email);

    if (!perms || perms.length === 0) return { data: [], error: null };

    const docIds = perms.map(p => p.document_id);

    // Fetch the actual docs
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .in('id', docIds);

    // Merge role info
    const docsWithRoles = data?.map(doc => {
        const perm = perms.find(p => p.document_id === doc.id);
        return { ...doc, sharedRole: perm?.role };
    });

    return { data: docsWithRoles || [], error };
}

// --- COMMENTS ---

export async function addComment(docId, content, selection = null) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('comments')
        .insert([{
            document_id: docId,
            user_id: session.user.id,
            user_email: session.user.email,
            content,
            selection_range: selection
        }])
        .select()
        .single();
    return { data, error };
}

export async function getComments(docId) {
    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('document_id', docId)
        .order('created_at', { ascending: true });
    // ... (existing getComments)
    return { data, error };
}

export async function updateComment(commentId, content) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .eq('user_id', session.user.id) // Security: Ensure owning user
        .select()
        .single();
    return { data, error };
}

export async function deleteComment(commentId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: 'Not authenticated' };

    // Note: We rely on RLS to allow deletion if user is owner OR doc owner
    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);
    return { error };
}

// --- DOCUMENT CHAT (PERSISTED + REALTIME) ---

export async function getDocumentChatMessages(docId, limit = 300) {
    const { data, error } = await supabase
        .from('document_chat_messages')
        .select('*')
        .eq('document_id', docId)
        .order('created_at', { ascending: true })
        .limit(limit);
    return { data, error };
}

export async function createDocumentChatMessage(docId, message, role = 'user') {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { data: null, error: 'Not authenticated' };

    const payload = {
        document_id: docId,
        user_id: session.user.id,
        user_email: session.user.email,
        role,
        message
    };

    const { data, error } = await supabase
        .from('document_chat_messages')
        .insert([payload])
        .select()
        .single();

    return { data, error };
}

export async function deleteDocumentChatMessage(messageId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: 'Not authenticated' };

    const { error } = await supabase
        .from('document_chat_messages')
        .delete()
        .eq('id', messageId);

    return { error };
}

export async function clearDocumentChatMessages(docId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: 'Not authenticated' };

    const { error } = await supabase
        .from('document_chat_messages')
        .delete()
        .eq('document_id', docId);

    return { error };
}

export function subscribeToDocumentChat(docId, { onInsert, onDelete, onError } = {}) {
    const channel = supabase
        .channel(`document-chat:${docId}:${Date.now()}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'document_chat_messages',
                filter: `document_id=eq.${docId}`
            },
            (payload) => {
                if (onInsert) onInsert(payload.new);
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'DELETE',
                schema: 'public',
                table: 'document_chat_messages',
                filter: `document_id=eq.${docId}`
            },
            (payload) => {
                if (onDelete) onDelete(payload.old);
            }
        )
        .subscribe((status) => {
            if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && onError) {
                onError(status);
            }
        });

    return () => {
        supabase.removeChannel(channel);
    };
}
