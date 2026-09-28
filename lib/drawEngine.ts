import { randomInt } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";

type Picked = { id: string; name: string; division: string };

/**
 * Picks one winner at random from the remaining participant pool,
 * assigns a random gift from remaining inventory, records the winner,
 * and updates both the participant and gift rows.
 *
 * This is the ONLY function that selects a winner. It draws a uniform
 * random position over the live pending pool (using Node's crypto RNG)
 * and reads only that one row, so it works for any pool size (Supabase
 * caps a normal query at 1000 rows, which must never limit who can win).
 * There is no parameter anywhere in this codebase to force an outcome.
 */
export async function drawOneWinner(sessionId: string) {
  const db = supabaseAdmin();

  // 1. Gift: every remaining gift UNIT is equally likely, so rare gifts
  //    are spread across the whole draw instead of all appearing early.
  const { data: gifts, error: giftErr } = await db
    .from("gifts")
    .select("id, gift_name, remaining_quantity")
    .eq("session_id", sessionId)
    .gt("remaining_quantity", 0);
  if (giftErr) throw giftErr;

  const totalUnits = (gifts ?? []).reduce((sum, g) => sum + g.remaining_quantity, 0);
  if (!gifts || gifts.length === 0 || totalUnits === 0) {
    return { done: true as const, reason: "No gifts remaining to award." };
  }

  let ticket = randomInt(totalUnits);
  let chosenGift = gifts[0];
  for (const g of gifts) {
    if (ticket < g.remaining_quantity) {
      chosenGift = g;
      break;
    }
    ticket -= g.remaining_quantity;
  }

  // 2. Participant: uniform random position in the pending pool, then
  //    "claim" that row so two simultaneous requests can never pick
  //    the same person.
  let chosen: Picked | null = null;
  for (let attempt = 0; attempt < 5 && !chosen; attempt++) {
    const { count, error: countErr } = await db
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "pending");
    if (countErr) throw countErr;
    if (!count) {
      return { done: true as const, reason: "No participants remaining in the pool." };
    }

    const offset = randomInt(count);
    const { data: rows, error: rowErr } = await db
      .from("participants")
      .select("id, name, division")
      .eq("session_id", sessionId)
      .eq("status", "pending")
      .order("id", { ascending: true })
      .range(offset, offset);
    if (rowErr) throw rowErr;

    const candidate = rows?.[0];
    if (!candidate) continue;

    const { data: claimed, error: claimErr } = await db
      .from("participants")
      .update({ status: "won" })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select("id");
    if (claimErr) throw claimErr;
    if (claimed && claimed.length > 0) chosen = candidate;
  }
  if (!chosen) throw new Error("Could not pick a participant, please try again.");
  const person: Picked = chosen;

  const releaseParticipant = async () => {
    await db.from("participants").update({ status: "pending" }).eq("id", person.id);
  };

  // 3. Next serial = highest existing serial + 1 (stays unique even
  //    after a Redo removes a winner from the middle).
  const { data: lastRows, error: serialErr } = await db
    .from("winners")
    .select("serial")
    .eq("session_id", sessionId)
    .order("serial", { ascending: false })
    .limit(1);
  if (serialErr) {
    await releaseParticipant();
    throw serialErr;
  }
  const serial = (lastRows?.[0]?.serial ?? 0) + 1;

  // 4. Persist: decrement the gift, insert the winner row.
  const { error: giftUpdateErr } = await db
    .from("gifts")
    .update({ remaining_quantity: chosenGift.remaining_quantity - 1 })
    .eq("id", chosenGift.id);
  if (giftUpdateErr) {
    await releaseParticipant();
    throw giftUpdateErr;
  }

  // The phone number stays on the participants table only. The winners
  // table is publicly readable (live screen), so it never holds a phone.
  const { data: winnerRow, error: winnerInsertErr } = await db
    .from("winners")
    .insert({
      session_id: sessionId,
      participant_id: person.id,
      name: person.name,
      division: person.division,
      gift: chosenGift.gift_name,
      serial,
    })
    .select()
    .single();

  if (winnerInsertErr) {
    await db
      .from("gifts")
      .update({ remaining_quantity: chosenGift.remaining_quantity })
      .eq("id", chosenGift.id);
    await releaseParticipant();
    throw winnerInsertErr;
  }

  return { done: false as const, winner: winnerRow };
}
