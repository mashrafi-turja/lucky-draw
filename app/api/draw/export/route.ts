import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchWinnersWithPhone } from "@/lib/winnersWithPhone";

export const dynamic = "force-dynamic";

// Real .xlsx export. Phone numbers are written as text so Excel keeps
// the leading 0, and Bangla names display correctly.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const winners = await fetchWinnersWithPhone(db, sessionId);
    const tz = process.env.EVENT_TIMEZONE || "Asia/Dhaka";

    const sheet = XLSX.utils.aoa_to_sheet([
      ["Serial", "Winner Name", "Division", "Phone", "Gift Name", "Draw Time"],
      ...winners.map((w) => [
        w.serial,
        w.name,
        w.division,
        w.phone,
        w.gift,
        new Date(w.created_at).toLocaleString("en-GB", { timeZone: tz }),
      ]),
    ]);
    sheet["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Winners");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const { data: project } = await db
      .from("draw_sessions")
      .select("name")
      .eq("id", sessionId)
      .single();
    const safeName =
      (project?.name ?? "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
      "draw";

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}-winners.xlsx"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Export failed" }, { status: 500 });
  }
}
