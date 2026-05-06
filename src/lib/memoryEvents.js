import { supabase } from '../../lib/supabase';

export const DEFAULT_HOME_LAYOUT = [
  'weekly_budget',
  'plan_my_week',
  'hottest_deals',
  'scan_item',
  'cart_summary',
];

export async function recordMemoryEvent(event) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, skipped: true };

    const { data, error } = await supabase.functions.invoke('record-memory-event', {
      body: event,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) throw error;
    return data || { ok: true };
  } catch (error) {
    console.warn('[memoryEvents] record failed:', error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function fetchDynamicHomeLayout() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { sections: DEFAULT_HOME_LAYOUT, fallback: true, source: 'local' };
    }

    const { data, error } = await supabase.functions.invoke('get-dynamic-home-layout', {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) throw error;
    if (!Array.isArray(data?.sections) || data.sections.length === 0) {
      return { sections: DEFAULT_HOME_LAYOUT, fallback: true, source: 'local' };
    }

    return data;
  } catch (error) {
    console.warn('[memoryEvents] layout failed:', error?.message || error);
    return { sections: DEFAULT_HOME_LAYOUT, fallback: true, source: 'local' };
  }
}
