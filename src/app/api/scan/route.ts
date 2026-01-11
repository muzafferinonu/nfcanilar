import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token gerekli" }, { status: 400 });
    }

    // Token hangi kolonda?
    const { data: rowA } = await supabaseAdmin
      .from("pairs")
      .select("id, token_a, token_b, scanned_a_at, scanned_b_at, is_complete")
      .eq("token_a", token)
      .maybeSingle();

    const { data: rowB } = await supabaseAdmin
      .from("pairs")
      .select("id, token_a, token_b, scanned_a_at, scanned_b_at, is_complete")
      .eq("token_b", token)
      .maybeSingle();

    const row = rowA ?? rowB;

    if (!row) {
      return NextResponse.json({ error: "Token bulunamadı" }, { status: 404 });
    }

    const isA = row.token_a === token;
    const isB = row.token_b === token;

    // İlgili timestamp boşsa doldur
    const patch: Record<string, any> = {};
    if (isA && !row.scanned_a_at) patch.scanned_a_at = new Date().toISOString();
    if (isB && !row.scanned_b_at) patch.scanned_b_at = new Date().toISOString();

    let updated = row;

    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabaseAdmin
        .from("pairs")
        .update(patch)
        .eq("id", row.id)
        .select("id, scanned_a_at, scanned_b_at, is_complete")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      updated = { ...row, ...data };
    }

    return NextResponse.json({
      pairId: updated.id,
      a: !!updated.scanned_a_at,
      b: !!updated.scanned_b_at,
      complete: !!updated.is_complete,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
