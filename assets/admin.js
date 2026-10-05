async function currentAdmin(){
  const url = C.SUPABASE_URL || '(trống)';

  try {
    const {
      data: { user },
      error: userError
    } = await sb.auth.getUser();

    if (userError) {
      return {
        ok: false,
        user: null,
        message:
          `AUTH ERROR\n` +
          `URL: ${url}\n` +
          `CODE: ${userError.code || 'N/A'}\n` +
          `MSG: ${userError.message}`
      };
    }

    if (!user) {
      return {
        ok: false,
        user: null,
        message: `NO USER\nURL: ${url}`
      };
    }

    const { data, error } = await sb
      .from('profiles')
      .select('id,role,display_name,is_blocked,blocked_reason')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        user,
        message:
          `PROFILE ERROR\n` +
          `URL: ${url}\n` +
          `USER: ${user.id}\n` +
          `CODE: ${error.code || 'N/A'}\n` +
          `MSG: ${error.message}\n` +
          `DETAILS: ${error.details || 'N/A'}\n` +
          `HINT: ${error.hint || 'N/A'}`
      };
    }

    if (!data) {
      return {
        ok: false,
        user,
        message:
          `PROFILE NOT FOUND\n` +
          `URL: ${url}\n` +
          `USER: ${user.id}`
      };
    }

    if (data.role !== 'admin') {
      return {
        ok: false,
        user,
        message:
          `NOT ADMIN\n` +
          `URL: ${url}\n` +
          `ROLE: ${data.role || 'NULL'}`
      };
    }

    if (data.is_blocked) {
      return {
        ok: false,
        user,
        message: `ADMIN BLOCKED\n${data.blocked_reason || ''}`
      };
    }

    return { ok: true, user, profile: data };

  } catch (e) {
    return {
      ok: false,
      user: null,
      message:
        `JS ERROR\n` +
        `URL: ${url}\n` +
        `MSG: ${e?.message || String(e)}`
    };
  }
}
