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
import {
  BarcodeLookupError,
  lookupBarcode,
  parseBarcodeProduct,
} from "@/lib/barcodeFood";
import type { IFCTItem } from "@/lib/foodDb";
export { parseBarcodeProduct };

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
    } catch (e) {
      const reason = e instanceof BarcodeLookupError ? e.reason : null;
      if (reason === "empty") {
        // A data gap, not a failure: name the product and point to search.
        toast.warning(
          `Found ${(e as BarcodeLookupError).productName || "this product"}, but it has no nutrition info — search it by name instead.`,
        );
        return;
      }
      console.error("Barcode lookup failed", e);
      toast.error(
        reason === "busy"
          ? "Food database is busy — try again in a few seconds."
          : reason === "timeout"
            ? "Taking too long — try again."
            : "Lookup failed — check your connection.",
      );
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
