// Droits d'accès : propriétaire, modification ou lecture, pour les notes et les carnets.
// Un carnet se partage avec des personnes (shares) ; ses notes et leurs tâches suivent.
// Une note peut aussi être partagée seule. Le propriétaire d'un carnet voit et modifie
// toutes les notes rangées dedans, même celles écrites par d'autres.
const RANK = { read: 1, edit: 2, owner: 3 };

module.exports = function createAccess(store) {
  const best = (a, b) => (RANK[a] || 0) >= (RANK[b] || 0) ? a : b;
  const roleIn = (shares, uid) => { const s = (shares || []).find((x) => x.userId === uid); return s ? s.role : null; };

  function notebookRole(uid, nb) {
    if (!nb) return null;
    if (nb.ownerId === uid) return 'owner';
    return roleIn(nb.shares, uid);
  }
  function noteRole(uid, n) {
    if (!n) return null;
    if (n.ownerId === uid) return 'owner';
    let role = roleIn(n.shares, uid);
    const nb = n.notebookId ? store.notebook(n.notebookId) : null;
    const r = notebookRole(uid, nb);
    if (r) role = best(role, r === 'owner' ? 'edit' : r);
    return role || null;
  }
  const allows = (role, need) => (RANK[role] || 0) >= (RANK[need] || 0);
  const visibleNotes = (uid) => store.db.notes.filter((n) => noteRole(uid, n));
  const visibleNotebooks = (uid) => store.db.notebooks.filter((c) => {
    if (notebookRole(uid, c)) return true;
    return false;
  });
  // Personnes qui voient une note (propriétaire compris) : pour assigner une tâche.
  function participants(n) {
    return store.db.users.filter((u) => noteRole(u.id, n)).map((u) => u.id);
  }
  function cleanShares(list, ownerId) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map((s) => ({ userId: String(s && s.userId || ''), role: s && s.role === 'edit' ? 'edit' : 'read' }))
      .filter((s) => s.userId !== ownerId && store.user(s.userId) && !seen.has(s.userId) && seen.add(s.userId));
  }
  return { notebookRole, noteRole, allows, visibleNotes, visibleNotebooks, participants, cleanShares };
};
