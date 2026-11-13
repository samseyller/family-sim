/**
 * Which personality situation an activity counts as (see personality.ts). Kept apart from the activity catalog so
 * the yearly plan can ask without importing it. Activities not listed have no trait reaction.
 */
import type { Situation } from './personality';

const SITUATIONS: Record<string, Situation> = {
  // Moving your body
  gym: 'exercise', yoga: 'exercise', hike: 'exercise', run_5k: 'exercise', run_marathon: 'exercise', hike_friends: 'exercise',
  pickup_game: 'exercise', rec_league: 'exercise', sport_event: 'exercise', play_catch: 'exercise', private_coach: 'exercise',
  sports_camp: 'exercise', coach_kids: 'exercise',
  // Rest
  spa_day: 'relax', movie_marathon: 'relax', read_book: 'relax', therapy: 'relax', quiet_day: 'relax',
  // Learning
  conference: 'learn', cooking_class: 'learn', hobby_workshop: 'learn', language: 'learn', science_fair: 'learn',
  // Making things and hobby work
  car_show: 'practice', cater_event: 'practice', dinner_party: 'practice', farmers_market: 'practice', fishing_tournament: 'practice',
  fishing_trip: 'practice', fix_cars: 'practice', garden_day: 'practice', play_gig: 'practice', restore_car: 'practice',
  run_food_truck: 'practice', scenic_flight: 'practice', sell_furniture: 'practice', music_camp: 'practice',
  // Seeing the world
  getaway: 'travel', vacation: 'travel', world_trip: 'travel', fly_visit: 'travel', visit_friend: 'travel', weekend_getaway: 'travel',
  // Being with people
  call_friend: 'socialize', coffee_friend: 'socialize', game_day: 'socialize', host_party: 'socialize', join_club: 'socialize',
  night_out: 'socialize', video_games: 'socialize', concert: 'socialize', ball_game: 'socialize', family_reunion: 'socialize',
  host_holiday: 'socialize', visit: 'socialize',
  // Helping
  help_friend_move: 'help', volunteer: 'help', do_chores: 'help', share_harvest: 'help', help_project: 'help', teach_drive: 'help',
  // Family time
  cook_together: 'familyOuting', game_night: 'familyOuting', park: 'familyOuting', garden: 'familyOuting', heart_to_heart: 'childTime',
  build_treehouse: 'childTime', date_night: 'partnerTime', picnic: 'partnerTime', concert_date: 'partnerTime',
  spend_the_night: 'partnerTime',
  // Something new
  try_new_together: 'newThing',
  // Aspiration activities
  share_creation: 'practice', mentor: 'help', volunteer_together: 'help', road_trip: 'travel', household_goal: 'familyOuting',
};

export const activitySituation = (id: string): Situation | undefined => SITUATIONS[id];
