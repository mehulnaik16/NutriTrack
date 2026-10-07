import { useRef, useState, type ReactNode } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import Webcam from "react-webcam";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Tapping `children` opens a small Camera / Gallery popup. Gallery picks one
 * image from the device. Camera on a phone opens its own camera app; PC
 * browsers ignore `capture`, so there it opens a live webcam view instead
 * (same react-webcam setup as the food photo dialog).
 */
export function PhotoSourcePicker({
  children,
  onPick,
}: {
  children: ReactNode;
  onPick: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamFailed, setWebcamFailed] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const isPC = () => !matchMedia("(pointer: coarse)").matches;

  const openCamera = () => {
    setOpen(false);
    if (isPC()) {
      setWebcamFailed(false);
      setWebcamOpen(true);
    } else cameraRef.current?.click();
  };
  const openGallery = () => {
    setOpen(false);
    galleryRef.current?.click();
  };
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same photo again still fires onChange
    if (file) onPick(file);
  };
  const snap = () => {
    webcamRef.current?.getCanvas()?.toBlob(
      (blob) => {
        if (!blob) return;
        onPick(new File([blob], "webcam.jpg", { type: "image/jpeg" }));
        setWebcamOpen(false);
      },
      "image/jpeg",
      0.92,
    );
  };

  const option =
    "flex flex-1 flex-col items-center gap-1.5 rounded-lg p-3 text-xs font-medium hover:bg-muted transition-colors";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="flex w-48 gap-1 p-1.5">
          <button type="button" className={option} onClick={openCamera}>
            <Camera className="h-6 w-6" />
            Camera
          </button>
          <button type="button" className={option} onClick={openGallery}>
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
      <Dialog open={webcamOpen} onOpenChange={setWebcamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" /> Take a progress photo
            </DialogTitle>
          </DialogHeader>
          <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border-2 border-border bg-black">
            {webcamFailed ? (
              <p className="px-8 text-center text-sm text-white/80">
                The camera isn't available. Close this and choose Gallery to
                upload a photo instead.
              </p>
            ) : (
              <>
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  mirrored
                  videoConstraints={{ width: { ideal: 1920 } }}
                  onUserMediaError={() => setWebcamFailed(true)}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-4 flex justify-center">
                  <button
                    onClick={snap}
                    aria-label="Take photo"
                    className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-accent bg-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  />
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
