/** Dog breeds, costs, and names. Five popular breeds to start. */

export type DogBreed = 'labrador' | 'golden' | 'shepherd' | 'frenchie' | 'beagle';
export type DogSize = 'small' | 'medium' | 'large';

export interface Coat {
  name: string;
  /** Main fur, darker shade (ears/shadow), muzzle/markings. */
  fur: string;
  dark: string;
  muzzle: string;
}

export interface BreedDef {
  label: string;
  size: DogSize;
  /** Puppy from a breeder. */
  price: number;
  /** Typical lifespan in years. */
  lifespan: number;
  /** How much exercise they need (walks matter more for high-energy dogs). */
  energy: 'low' | 'medium' | 'high';
  blurb: string;
  coats: Coat[];
}

export const BREEDS: Record<DogBreed, BreedDef> = {
  labrador: {
    label: 'Labrador Retriever', size: 'large', price: 1500, lifespan: 12, energy: 'high', blurb: 'Friendly, food-motivated, loves everyone',
    coats: [
      { name: 'yellow', fur: '#e6c07b', dark: '#c99a52', muzzle: '#f0d49e' },
      { name: 'black', fur: '#2e2b29', dark: '#1a1817', muzzle: '#3a3633' },
      { name: 'chocolate', fur: '#6b4429', dark: '#4e301c', muzzle: '#7d5333' },
    ],
  },
  golden: {
    label: 'Golden Retriever', size: 'large', price: 2000, lifespan: 11, energy: 'high', blurb: 'Gentle, patient, great with kids',
    coats: [
      { name: 'golden', fur: '#d9a148', dark: '#b97f2c', muzzle: '#e9c07a' },
      { name: 'light golden', fur: '#ebc98d', dark: '#d4a862', muzzle: '#f4dfb4' },
      { name: 'red', fur: '#b8692e', dark: '#93501f', muzzle: '#cd8549' },
    ],
  },
  shepherd: {
    label: 'German Shepherd', size: 'large', price: 2500, lifespan: 11, energy: 'high', blurb: 'Loyal, smart, protective',
    coats: [
      { name: 'black and tan', fur: '#c4884a', dark: '#2a2420', muzzle: '#2f2823' },
      { name: 'sable', fur: '#a77a4a', dark: '#4a3a2c', muzzle: '#3a2e24' },
    ],
  },
  frenchie: {
    label: 'French Bulldog', size: 'small', price: 3500, lifespan: 11, energy: 'low', blurb: 'Playful couch potato, big bat ears',
    coats: [
      { name: 'fawn', fur: '#d6ad78', dark: '#b88c58', muzzle: '#3b302a' },
      { name: 'brindle', fur: '#5b4535', dark: '#3d2e23', muzzle: '#2c231d' },
      { name: 'cream', fur: '#efe0c2', dark: '#d9c59e', muzzle: '#cdb994' },
    ],
  },
  beagle: {
    label: 'Beagle', size: 'medium', price: 1200, lifespan: 13, energy: 'medium', blurb: 'Curious nose, big voice, very merry',
    coats: [
      { name: 'tricolor', fur: '#c47d3c', dark: '#2f2722', muzzle: '#f4efe6' },
      { name: 'lemon', fur: '#e3c088', dark: '#cfa564', muzzle: '#f6f0e4' },
    ],
  },
};

/** Food, vet, grooming, and boarding per year. Seniors cost more at the vet. */
export const DOG_YEARLY: Record<DogSize, number> = { small: 1300, medium: 1600, large: 2100 };
export const SENIOR_VET_EXTRA = 0.5;
/** Adopting an adult dog from a shelter. */
export const SHELTER_FEE = 300;
export const MAX_DOGS = 3;
/** A small apartment only allows one dog. */
export const SMALL_RENTAL_DOGS = 1;
/** Happiness each year for everyone at home (per dog, up to two dogs' worth). */
export const DOG_JOY = 3;

export const DOG_NAMES = [
  'Max', 'Bella', 'Charlie', 'Luna', 'Cooper', 'Daisy', 'Buddy', 'Lucy', 'Rocky', 'Sadie', 'Bear', 'Molly',
  'Duke', 'Maggie', 'Tucker', 'Rosie', 'Murphy', 'Penny', 'Biscuit', 'Waffles', 'Scout', 'Hazel', 'Milo', 'Pepper',
  'Ziggy', 'Olive', 'Gus', 'Honey', 'Otis', 'Mochi',
];
