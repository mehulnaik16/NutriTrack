/**
 * Scan a packaged product's barcode and look it up on Open Food Facts.
 *
 * Hands the food back rather than writing it anywhere: the food log opens its
 * quantity dialog on it, the meal builder appends it as an ingredient. Lifted
 * out of FoodSearch so both screens can use it.
 *
 * Pulls in BarcodeScanner and with it `@zxing/*`, the heaviest dependency in
 * this area, so both callers load it through `React.lazy`.
 */

import { useState } from "react";
import { Loader2, ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type IFCTItem, KJ_PER_KCAL } from "@/lib/foodDb";

// ── Barcode lookup via Open Food Facts ───────────────────────────────────────
async function lookupBarcode(barcode: string): Promise<IFCTItem | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1) return null;
  const n = data.product.nutriments;
  return {
    code: barcode,
    name: data.product.product_name ?? "Unknown product",
    scie: "",
    lang: "",
    grup: "Packaged",
    enerc: (n["energy-kcal_100g"] ?? 0) * KJ_PER_KCAL,
    protcnt: n.proteins_100g ?? 0,
    fatce: n.fat_100g ?? 0,
    choavldf: n.carbohydrates_100g ?? 0,
    fibtg: n.fiber_100g ?? 0,
  };
}

export function ScanFoodDialog({
  open,
  onOpenChange,
  onFound,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a per-100 g food. Cannot fail, so the dialog closes itself. */
  onFound: (item: IFCTItem) => void;
}) {
  const [value, setValue] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const lookUp = async (code = value) => {
    if (!code) return;
    setLookingUp(true);
    try {
      const item = await lookupBarcode(code.trim());
      if (!item) {
        toast.error("Product not found.");
        return;
      }
      onFound(item);
      setValue("");
      onOpenChange(false);
    } catch {
      // Without this the button span forever on a dropped connection.
      toast.error("Lookup failed — check your connection.");
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setValue("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" /> Barcode Lookup
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            {open && (
              <BarcodeScanner
                onDetected={(code) => {
                  setValue(code);
                  lookUp(code);
                }}
              />
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground font-bold">
                Or enter manually
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="e.g. 8901030871221"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookUp()}
              inputMode="numeric"
            />
            <Button
              onClick={() => lookUp()}
              disabled={lookingUp || !value}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            >
              {lookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}{" "}
              Look up product
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
