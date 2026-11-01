import { catalogHash, CatalogProductSchema, type CatalogProduct } from "@handshake/shared";
import type { CatalogProvider } from "./types";

export const FIXTURE_MERCHANT_AGENT_ID = "agt_merchant_ridgeway";
export const FIXTURE_CATALOG_ID = "cat_ridgeway_industrial_v1";

interface Seed {
  sku: string;
  name: string;
  category: string;
  description: string;
  listPriceMinor: number;
  unitCostMinor: number;
  stock: number;
}

/**
 * Thirty products across four categories. Prices and stock are invented but
 * internally consistent: every unit cost sits below list price with enough room
 * for the merchant's 25% margin floor.
 */
const SEEDS: readonly Seed[] = [
  // PPE ---------------------------------------------------------------------
  {
    sku: "sku_ppe_gloves_nitrile_box100",
    name: "Nitrile gloves, box of 100",
    category: "PPE",
    description: "Powder-free 4 mil nitrile examination gloves, blue, size M.",
    listPriceMinor: 1_250,
    unitCostMinor: 900,
    stock: 240,
  },
  {
    sku: "sku_ppe_gloves_latex_box100",
    name: "Latex examination gloves, box of 100",
    category: "PPE",
    description: "Powdered natural rubber latex gloves for non-clinical tasks.",
    listPriceMinor: 990,
    unitCostMinor: 700,
    stock: 180,
  },
  {
    sku: "sku_ppe_masks_n95_box20",
    name: "N95 respirator masks, box of 20",
    category: "PPE",
    description: "NIOSH-equivalent N95 cup respirators with adjustable nose clip.",
    listPriceMinor: 3_400,
    unitCostMinor: 2_450,
    stock: 120,
  },
  {
    sku: "sku_ppe_gown_sms_pack10",
    name: "SMS isolation gowns, pack of 10",
    category: "PPE",
    description: "Fluid-resistant 45 gsm SMS gowns with knitted cuffs.",
    listPriceMinor: 4_200,
    unitCostMinor: 3_000,
    stock: 90,
  },
  {
    sku: "sku_ppe_eyewear_clear",
    name: "Anti-fog safety spectacles, clear",
    category: "PPE",
    description: "EN 166 rated wrap-around spectacles with anti-scratch coating.",
    listPriceMinor: 890,
    unitCostMinor: 620,
    stock: 300,
  },
  {
    sku: "sku_ppe_sanitiser_500ml",
    name: "Hand sanitiser, 500 ml pump",
    category: "PPE",
    description: "70% alcohol gel sanitiser with aloe, single pump bottle.",
    listPriceMinor: 640,
    unitCostMinor: 400,
    stock: 500,
  },
  {
    sku: "sku_ppe_wipes_canister",
    name: "Disinfectant wipes, canister of 100",
    category: "PPE",
    description: "Alcohol-free quaternary wipes for hard surfaces.",
    listPriceMinor: 780,
    unitCostMinor: 520,
    stock: 260,
  },
  {
    sku: "sku_ppe_face_shield_pack5",
    name: "Reusable face shields, pack of 5",
    category: "PPE",
    description: "Anti-fog PET shields with adjustable headband and foam brow.",
    listPriceMinor: 2_150,
    unitCostMinor: 1_500,
    stock: 75,
  },

  // LIGHTING ----------------------------------------------------------------
  {
    sku: "sku_light_work_lamp_led",
    name: "LED work lamp, 30 W",
    category: "LIGHTING",
    description: "IP65 site lamp, 3 000 lm, 5 m cable, folding stand.",
    listPriceMinor: 4_600,
    unitCostMinor: 3_200,
    stock: 64,
  },
  {
    sku: "sku_light_head_torch",
    name: "Rechargeable head torch, 400 lm",
    category: "LIGHTING",
    description: "USB-C head torch with red night mode and motion sensor.",
    listPriceMinor: 2_750,
    unitCostMinor: 1_900,
    stock: 110,
  },
  {
    sku: "sku_light_strip_5m",
    name: "LED strip light, 5 m warm white",
    category: "LIGHTING",
    description: "24 V dimmable strip, 1 200 lm per metre, IP20, adhesive back.",
    listPriceMinor: 1_850,
    unitCostMinor: 1_250,
    stock: 140,
  },
  {
    sku: "sku_light_bulb_e27_4pack",
    name: "LED bulb E27 9 W, pack of 4",
    category: "LIGHTING",
    description: "2 700 K warm white, 806 lm, 15 000 hour rated.",
    listPriceMinor: 1_240,
    unitCostMinor: 820,
    stock: 320,
  },
  {
    sku: "sku_light_floodlight_50w",
    name: "Floodlight 50 W with PIR",
    category: "LIGHTING",
    description: "Die-cast aluminium security floodlight, IP65, 1 m detection.",
    listPriceMinor: 5_900,
    unitCostMinor: 4_100,
    stock: 40,
  },
  {
    sku: "sku_light_emergency_twin",
    name: "Emergency twin-spot light",
    category: "LIGHTING",
    description: "3 hour maintained emergency luminaire with self-test.",
    listPriceMinor: 3_650,
    unitCostMinor: 2_500,
    stock: 55,
  },
  {
    sku: "sku_light_task_clamp",
    name: "Clamp-on task light, USB-C",
    category: "LIGHTING",
    description: "Dimmable desk clamp light with 3 colour temperatures.",
    listPriceMinor: 3_100,
    unitCostMinor: 2_150,
    stock: 88,
  },

  // PACKAGING ---------------------------------------------------------------
  {
    sku: "sku_pack_box_400x300x200",
    name: "Double-wall box 400×300×200 mm, pack of 10",
    category: "PACKAGING",
    description: "Kraft double-wall cartons, 44 ECT, flat-packed.",
    listPriceMinor: 1_980,
    unitCostMinor: 1_350,
    stock: 200,
  },
  {
    sku: "sku_pack_tape_48mm",
    name: "Packing tape 48 mm × 66 m, pack of 6",
    category: "PACKAGING",
    description: "Clear acrylic carton sealing tape, 50 micron.",
    listPriceMinor: 1_150,
    unitCostMinor: 760,
    stock: 400,
  },
  {
    sku: "sku_pack_bubble_roll",
    name: "Bubble wrap roll, 500 mm × 50 m",
    category: "PACKAGING",
    description: "10 mm bubble protective wrap with perforated every 300 mm.",
    listPriceMinor: 1_720,
    unitCostMinor: 1_180,
    stock: 130,
  },
  {
    sku: "sku_pack_mailer_a4",
    name: "Padded mailers A4, pack of 50",
    category: "PACKAGING",
    description: "Recycled padded envelopes with peel-and-seal closure.",
    listPriceMinor: 1_420,
    unitCostMinor: 950,
    stock: 210,
  },
  {
    sku: "sku_pack_label_roll",
    name: "Thermal labels 100×150 mm, roll of 500",
    category: "PACKAGING",
    description: "Direct thermal shipping labels, BPA-free, perforated.",
    listPriceMinor: 1_640,
    unitCostMinor: 1_100,
    stock: 260,
  },
  {
    sku: "sku_pack_stretch_roll",
    name: "Pallet stretch wrap, 500 mm × 300 m",
    category: "PACKAGING",
    description: "17 micron blown film with 20% recycled content.",
    listPriceMinor: 2_450,
    unitCostMinor: 1_700,
    stock: 95,
  },
  {
    sku: "sku_pack_void_fill",
    name: "Paper void fill, 400 sheets",
    category: "PACKAGING",
    description: "FSC-certified fanfold kraft paper for carton void fill.",
    listPriceMinor: 1_890,
    unitCostMinor: 1_300,
    stock: 150,
  },
  {
    sku: "sku_pack_pallet_corner",
    name: "Pallet corner protectors, pack of 20",
    category: "PACKAGING",
    description: "Recycled board edge protectors, 1 200 mm.",
    listPriceMinor: 2_160,
    unitCostMinor: 1_450,
    stock: 110,
  },

  // OFFICE ------------------------------------------------------------------
  {
    sku: "sku_office_notebook_a5",
    name: "Recycled A5 notebook, pack of 5",
    category: "OFFICE",
    description: "96-page ruled notebooks with recycled board covers.",
    listPriceMinor: 960,
    unitCostMinor: 620,
    stock: 340,
  },
  {
    sku: "sku_office_pen_gel",
    name: "Gel pens, box of 12",
    category: "OFFICE",
    description: "0.7 mm retractable black gel pens with refillable barrels.",
    listPriceMinor: 780,
    unitCostMinor: 480,
    stock: 420,
  },
  {
    sku: "sku_office_toner_black",
    name: "Laser toner cartridge, black",
    category: "OFFICE",
    description: "Yield 3 000 pages at 5% coverage, remanufactured cartridge.",
    listPriceMinor: 8_900,
    unitCostMinor: 6_200,
    stock: 45,
  },
  {
    sku: "sku_office_whiteboard_900",
    name: "Whiteboard 900×600 mm with tray",
    category: "OFFICE",
    description: "Magnetic lacquered steel board with aluminium frame and pen tray.",
    listPriceMinor: 5_400,
    unitCostMinor: 3_800,
    stock: 35,
  },
  {
    sku: "sku_office_desk_mat",
    name: "Ergonomic desk mat, 900×400 mm",
    category: "OFFICE",
    description: "PU leather mat with stitched edge and non-slip backing.",
    listPriceMinor: 3_300,
    unitCostMinor: 2_250,
    stock: 60,
  },
  {
    sku: "sku_office_first_aid",
    name: "Workplace first-aid kit, 50 person",
    category: "OFFICE",
    description: "BS 8599-1 compliant kit in wall-mountable case.",
    listPriceMinor: 4_250,
    unitCostMinor: 2_950,
    stock: 70,
  },
  {
    sku: "sku_office_usb_c_hub",
    name: "USB-C hub, 7 ports",
    category: "OFFICE",
    description: "HDMI 4K, 2× USB-A, 2× USB-C, SD, microSD, 100 W passthrough.",
    listPriceMinor: 4_600,
    unitCostMinor: 3_200,
    stock: 58,
  },
];

export interface FixtureProviderOptions {
  merchantAgentId?: string;
  catalogId?: string;
  now?: () => Date;
}

export class FixtureProvider implements CatalogProvider {
  readonly source = "FIXTURE" as const;
  readonly simulated = true;
  readonly merchantAgentId: string;
  readonly catalogId: string;
  private readonly now: () => Date;
  private readonly products: CatalogProduct[];

  constructor(options: FixtureProviderOptions = {}) {
    this.merchantAgentId = options.merchantAgentId ?? FIXTURE_MERCHANT_AGENT_ID;
    this.catalogId = options.catalogId ?? FIXTURE_CATALOG_ID;
    this.now = options.now ?? (() => new Date());
    this.products = SEEDS.map((seed) =>
      CatalogProductSchema.parse({
        ...seed,
        merchantAgentId: this.merchantAgentId,
        source: "FIXTURE",
        simulated: true,
      }),
    );
  }

  async list(): Promise<CatalogProduct[]> {
    return this.products.map((product) => ({ ...product }));
  }

  async search(query: string, options: { category?: string; limit?: number } = {}): Promise<CatalogProduct[]> {
    const needle = query.trim().toLowerCase();
    const limit = options.limit ?? 20;
    return this.products
      .filter((product) => (options.category ? product.category === options.category : true))
      .filter(
        (product) =>
          needle.length === 0 ||
          product.name.toLowerCase().includes(needle) ||
          product.sku.toLowerCase().includes(needle) ||
          product.description.toLowerCase().includes(needle) ||
          product.category.toLowerCase().includes(needle),
      )
      .slice(0, limit)
      .map((product) => ({ ...product }));
  }

  async get(sku: string): Promise<CatalogProduct | null> {
    const product = this.products.find((candidate) => candidate.sku === sku);
    return product ? { ...product } : null;
  }

  async categories(): Promise<string[]> {
    return [...new Set(this.products.map((product) => product.category))].sort();
  }

  async hash(): Promise<string> {
    return catalogHash(this.products);
  }

  inventoryCheckedAt(): string {
    // The fixture inventory is static, so "checked now" is accurate for the snapshot.
    return this.now().toISOString();
  }
}
