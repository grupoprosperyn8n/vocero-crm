import { describe, expect, it } from "vitest";

import {
  canArchiveProposal,
  canDeleteLibraryItem,
  canDeleteProposal,
  canToggleProposalOnline,
  isManagerOrAbove,
  isOwnerOrAdmin,
} from "@/server/proposals/permissions";
import { sniffLibraryMedia } from "@/server/library/media";

function bytes(...values: (number | string)[]): Uint8Array {
  const out: number[] = [];

  for (const v of values) {
    if (typeof v === "number") out.push(v);
    else for (const c of v) out.push(c.charCodeAt(0));
  }

  return new Uint8Array([...out, ...new Array(64).fill(0)]);
}

describe("041e — permisos de las gestiones", () => {
  it("eliminar: solo dueño y propietario", () => {
    expect(canDeleteProposal("owner")).toBe(true);
    expect(canDeleteProposal("admin")).toBe(true);
    expect(canDeleteProposal("manager")).toBe(false);
    expect(canDeleteProposal("member")).toBe(false);
  });

  it("archivar y pausar: gerente para arriba", () => {
    for (const role of ["owner", "admin", "manager"]) {
      expect(canArchiveProposal(role)).toBe(true);
      expect(canToggleProposalOnline(role)).toBe(true);
    }
    expect(canArchiveProposal("member")).toBe(false);
    expect(canToggleProposalOnline("member")).toBe(false);
  });

  it("los helpers base", () => {
    expect(isOwnerOrAdmin("owner")).toBe(true);
    expect(isOwnerOrAdmin("manager")).toBe(false);
    expect(isManagerOrAbove("manager")).toBe(true);
    expect(isManagerOrAbove("member")).toBe(false);
  });
});

describe("041d — quién puede quitar un archivo del contenedor", () => {
  const base = { viewerId: "u1", uploadedBy: "u2" };

  it("archivo protegido (dueño/gerente): solo dueño y propietario", () => {
    expect(
      canDeleteLibraryItem({ ...base, viewerRole: "member", protected: true })
    ).toBe(false);
    expect(
      canDeleteLibraryItem({ ...base, viewerRole: "manager", protected: true })
    ).toBe(false);
    expect(
      canDeleteLibraryItem({ ...base, viewerRole: "admin", protected: true })
    ).toBe(true);
    expect(
      canDeleteLibraryItem({ ...base, viewerRole: "owner", protected: true })
    ).toBe(true);
  });

  it("archivo común: lo quita su autor o quien gestiona", () => {
    expect(
      canDeleteLibraryItem({
        viewerRole: "member",
        viewerId: "u2",
        uploadedBy: "u2",
        protected: false,
      })
    ).toBe(true);
    expect(
      canDeleteLibraryItem({
        viewerRole: "member",
        viewerId: "u1",
        uploadedBy: "u2",
        protected: false,
      })
    ).toBe(false);
    expect(
      canDeleteLibraryItem({
        viewerRole: "manager",
        viewerId: "u1",
        uploadedBy: "u2",
        protected: false,
      })
    ).toBe(true);
  });
});

describe("041d — qué es de verdad cada archivo (firma de bytes)", () => {
  it("imágenes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const webp = bytes("RIFF", 0, 0, 0, 0, "WEBP");

    expect(sniffLibraryMedia(png)?.kind).toBe("image");
    expect(sniffLibraryMedia(png)?.mime).toBe("image/png");
    expect(sniffLibraryMedia(jpeg)?.mime).toContain("image/");
    expect(sniffLibraryMedia(webp)?.mime).toBe("image/webp");
  });

  it("videos", () => {
    const mp4 = bytes(0, 0, 0, 0, "ftyp", "isom", 0, 0, 0, 0);
    const mov = bytes(0, 0, 0, 0, "ftyp", "qt  ", 0, 0, 0, 0);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
    const avi = bytes("RIFF", 0, 0, 0, 0, "AVI ");

    expect(sniffLibraryMedia(mp4)?.kind).toBe("video");
    expect(sniffLibraryMedia(mp4)?.mime).toBe("video/mp4");
    expect(sniffLibraryMedia(mov)?.mime).toBe("video/quicktime");
    expect(sniffLibraryMedia(webm)?.mime).toBe("video/webm");
    expect(sniffLibraryMedia(avi)?.mime).toBe("video/x-msvideo");
  });

  it("lo que no reconocemos no entra", () => {
    expect(sniffLibraryMedia(bytes("MZ", 0x90, 0x00))).toBeNull();
    expect(sniffLibraryMedia(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});
