/** Cat breeds, costs, and names. Cats are indoor pets: cheaper than dogs, no walks, long lives. */

export type CatBreed = 'tabby' | 'maine_coon' | 'siamese' | 'persian' | 'ragdoll';

export interface CatCoat {
  name: string;
  /** Main fur, darker shade (stripes, points, ear tips), light fur (muzzle, chest). */
  fur: string;
  dark: string;
  light: string;
}

export interface CatBreedDef {
  label: string;
  longHair: boolean;
  /** Kitten from a breeder. */
  price: number;
  /** Typical lifespan in years. */
  lifespan: number;
  /** How they bond: aloof cats drift slowly but warm slowly; affectionate ones the opposite. */
  temperament: 'aloof' | 'affectionate' | 'playful';
  blurb: string;
  /** Blue eyes (colorpoint breeds) instead of green/amber. */
  blueEyes?: boolean;
  coats: CatCoat[];
}

export const CAT_BREEDS: Record<CatBreed, CatBreedDef> = {
  tabby: {
    label: 'Domestic Shorthair', longHair: false, price: 250, lifespan: 15, temperament: 'playful', blurb: 'The classic house cat: curious, independent, a little chaotic',
    coats: [
      { name: 'orange tabby', fur: '#e0954a', dark: '#b8692a', light: '#f4d3a8' },
      { name: 'grey tabby', fur: '#8f8a86', dark: '#5a5552', light: '#d9d4cf' },
      { name: 'black', fur: '#2a2726', dark: '#151313', light: '#3a3634' },
      { name: 'tuxedo', fur: '#2a2726', dark: '#151313', light: '#f4f1ec' },
    ],
  },
  maine_coon: {
    label: 'Maine Coon', longHair: true, price: 1500, lifespan: 13, temperament: 'affectionate', blurb: 'Gentle giant with a lion’s ruff and ear tufts',
    coats: [
      { name: 'brown tabby', fur: '#8a6a4a', dark: '#4e3a28', light: '#d9c4a8' },
      { name: 'red', fur: '#c4743a', dark: '#93501f', light: '#efcfa8' },
      { name: 'silver', fur: '#b8b6b2', dark: '#6e6b68', light: '#ecebe8' },
    ],
  },
  siamese: {
    label: 'Siamese', longHair: false, price: 1200, lifespan: 15, temperament: 'affectionate', blurb: 'Chatty, clingy, will narrate your whole day', blueEyes: true,
    coats: [
      { name: 'seal point', fur: '#efe4d2', dark: '#4a3528', light: '#f8f2e8' },
      { name: 'blue point', fur: '#ecebe8', dark: '#6f7480', light: '#f8f8f6' },
    ],
  },
  persian: {
    label: 'Persian', longHair: true, price: 2000, lifespan: 14, temperament: 'aloof', blurb: 'Flat-faced royalty: calm, fluffy, high-maintenance',
    coats: [
      { name: 'white', fur: '#f4f1ec', dark: '#d6d0c6', light: '#fbf9f6' },
      { name: 'cream', fur: '#ead7b4', dark: '#cdb48a', light: '#f6ecdb' },
      { name: 'smoke', fur: '#6e6a68', dark: '#3e3b3a', light: '#a8a4a1' },
    ],
  },
  ragdoll: {
    label: 'Ragdoll', longHair: true, price: 1800, lifespan: 15, temperament: 'affectionate', blurb: 'Goes limp in your arms; follows you room to room', blueEyes: true,
    coats: [
      { name: 'seal mitted', fur: '#ece2d2', dark: '#5a4232', light: '#faf6ee' },
      { name: 'blue bicolor', fur: '#e6e6e8', dark: '#757a86', light: '#fafafa' },
    ],
  },
};

/** Food, litter, vet per year; long-haired cats add grooming. Seniors cost more at the vet. */
export const CAT_YEARLY = { short: 900, long: 1250 };
export const CAT_SENIOR_VET_EXTRA = 0.5;
/** Adopting an adult cat from a shelter. */
export const CAT_SHELTER_FEE = 150;
export const MAX_CATS = 4;
/** A small apartment allows two cats. */
export const SMALL_RENTAL_CATS = 2;
/** Happiness each year for everyone at home (per cat, up to two cats' worth). */
export const CAT_JOY = 2;
/** A cat tree: happier cats, and fewer shredded couches. */
export const CAT_TREE_COST = 250;

export const CAT_NAMES = [
  'Luna', 'Oliver', 'Leo', 'Milo', 'Chloe', 'Simba', 'Nala', 'Cleo', 'Jasper', 'Willow', 'Pumpkin', 'Shadow',
  'Mittens', 'Ginger', 'Smokey', 'Pepper', 'Whiskers', 'Biscuit', 'Toast', 'Noodle', 'Pickles', 'Socks', 'Tiger',
  'Marmalade', 'Ash', 'Olive', 'Bean', 'Sushi', 'Waffles', 'Juniper',
];
