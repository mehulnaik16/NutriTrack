import { useRef, useState, type ReactNode } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Tapping `children` opens a small Camera / Gallery popup. Camera opens the
 * rear camera directly; Gallery picks one image from the device. On a PC the
 * tap opens the file picker straight away.
 */
export function PhotoSourcePicker({
  children,
  onPick,
}: {
  children: ReactNode;
  onPick: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const choose = (ref: React.RefObject<HTMLInputElement | null>) => {
    setOpen(false);
    ref.current?.click();
  };
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same photo again still fires onChange
    if (file) onPick(file);
  };

  const option =
    "flex flex-1 flex-col items-center gap-1.5 rounded-lg p-3 text-xs font-medium hover:bg-muted transition-colors";

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // PC browsers ignore `capture`, so Camera would just open the file
          // picker too. No touchscreen as main input → skip the popup.
          if (next && !matchMedia("(pointer: coarse)").matches) {
            galleryRef.current?.click();
            return;
          }
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="flex w-48 gap-1 p-1.5">
          <button type="button" className={option} onClick={() => choose(cameraRef)}>
            <Camera className="h-6 w-6" />
            Camera
          </button>
          <button type="button" className={option} onClick={() => choose(galleryRef)}>
            <ImageIcon className="h-6 w-6" />
            Gallery
          </button>
        </PopoverContent>
      </Popover>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handle}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handle}
      />
    </>
  );
}
