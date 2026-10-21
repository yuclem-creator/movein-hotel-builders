// team.js — one hotel, several people.
//
// The rule is deliberately narrow: whoever joined first is the sequencer. Everyone else sends
// intents; the sequencer validates them against the engine and republishes them with a
// sequence number; every device applies the same intents in the same order. No device ever
// merges state, so "two hotels" cannot happen — a peer's session is a replay of the leader's
// decisions, not a copy that drifts.
//
// A late joiner receives one snapshot (placements carry the leader's uids), then follows the
// stream. If the sequencer disappears, the next earliest member takes over on the next
// heartbeat, with the sequence number continuing from what it has applied.
import { applyIntent, snapshotOf, adoptSnapshot } from '../sim/intents.js';

const HEARTBEAT_MS = 2000;
const SILENT_MS = 7000;

export function createTeam({ bus, self, name, session, onChange = () => {} }) {
  const presence = new Map();
  const joinedAt = Date.now();
  let seq = 0;
  let appliedUpTo = 0;
  let intentId = 0;
  let closed = false;

  presence.set(self, { id: self, name, at: joinedAt, seen: joinedAt });

  const send = (msg) => bus.send({ ...msg, from: self });
  const touch = (member) => presence.set(member.id, { ...member, seen: Date.now() });

  const prune = () => {
    const cutoff = Date.now() - SILENT_MS;
    for (const [id, m] of presence) if (m.seen < cutoff && id !== self) presence.delete(id);
  };

  /** Earliest join wins; the id breaks ties so two peers never both believe they lead. */
  const leaderId = () => {
    prune();
    const list = [...presence.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    return list.length ? list[0].id : self;
  };
  const isLeader = () => leaderId() === self;

  const applyLocally = (intent) => {
    const res = applyIntent(session, intent);
    onChange({ intent, res, applied: true });
    return res;
  };

  /** A place intent gains the leader's uid on its way back out, so everyone addresses the
   *  same building afterwards. */
  const echoable = (intent, res) => (intent.op === 'place' && res.ok && res.uid
    ? { ...intent, uid: res.uid }
    : intent);

  bus.onMessage((msg) => {
    if (!msg || msg.from === self || closed) return;

    switch (msg.k) {
      case 'hello': {
        // A heartbeat is not a join. Sending a snapshot on every beat would repaint — and
        // reset the screen of — devices that are already in step, which is exactly how a
        // team ends up staring at the build screen after a round has been run.
        const isNew = !presence.has(msg.from);
        touch({ id: msg.from, name: msg.name || 'Teammate', at: msg.at || Date.now() });
        if (isLeader() && (isNew || msg.resync)) {
          send({ k: 'snapshot', to: msg.from, seq: appliedUpTo, leader: self, state: snapshotOf(session) });
        }
        onChange({ presence: true });
        break;
      }
      case 'intent': {
        if (!isLeader()) return;
        const res = applyLocally({ ...msg.intent });
        // Broadcast, not a private reply: the leader has already applied this, so every
        // peer must apply it too. `requester` is for the one device that is waiting to
        // learn its intent was refused.
        send({
          k: 'applied',
          seq: ++seq,
          intent: echoable(msg.intent, res),
          ok: res.ok,
          reason: res.reason,
          requester: msg.from,
          id: msg.id,
        });
        break;
      }
      case 'applied': {
        if (msg.seq <= appliedUpTo) return;
        appliedUpTo = msg.seq;
        if (msg.ok !== false) applyLocally(msg.intent);
        else if (msg.requester === self) onChange({ rejected: msg });
        break;
      }
      case 'snapshot': {
        if (msg.to && msg.to !== self) return;
        adoptSnapshot(session, msg.state);
        appliedUpTo = Math.max(appliedUpTo, msg.seq || 0);
        onChange({ snapshot: true });
        break;
      }
      case 'bye': {
        presence.delete(msg.from);
        onChange({ presence: true });
        break;
      }
      default:
        break;
    }
  });

  const announce = () => send({ k: 'hello', name, at: joinedAt });
  announce();

  const beat = setInterval(() => {
    if (closed) return;
    prune();
    presence.set(self, { ...presence.get(self), seen: Date.now() });
    announce();
  }, HEARTBEAT_MS);

  return {
    get leader() { return isLeader(); },
    get leaderId() { return leaderId(); },
    get size() { return presence.size; },
    get members() { return [...presence.values()].map(({ id, name: n }) => ({ id, name: n })); },
    get kind() { return bus.kind; },

    /** Apply a change here if this device sequences, otherwise ask the sequencer to. */
    commit(intent) {
      // A promoted leader continues the numbering it has already applied, so late peers
      // never see a sequence go backwards.
      if (seq < appliedUpTo) seq = appliedUpTo;
      const id = `${self}:${++intentId}`;
      if (isLeader()) {
        const res = applyLocally(intent);
        send({ k: 'applied', seq: ++seq, intent: echoable(intent, res), ok: res.ok, reason: res.reason, id, broadcast: true });
        return res;
      }
      send({ k: 'intent', intent, id, to: leaderId() });
      return { ok: true, pending: true };
    },

    requestSnapshot() {
      send({ k: 'hello', name, at: joinedAt, resync: true });
    },

    close() {
      closed = true;
      clearInterval(beat);
      send({ k: 'bye' });
      bus.close();
    },
  };
}
