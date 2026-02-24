export interface FitActivity {
  timestamp?: Date;
  num_sessions?: number;
  type?: string;
  event?: string;
  event_type?: string;
}

export interface FitSession {
  timestamp?: Date;
  start_time?: Date;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_moving_time?: number;
  total_calories?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_cadence?: number;
  max_cadence?: number;
  avg_power?: number;
  max_power?: number;
  avg_vertical_oscillation?: number;
  avg_ground_contact_time?: number;
  avg_stride_length?: number;
  total_ascent?: number;
  total_descent?: number;
  time_in_hr_zone?: number[];
  sport?: string;
  sub_sport?: string;
}

export interface FitLap {
  timestamp?: Date;
  start_time?: Date;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_moving_time?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_cadence?: number;
  avg_power?: number;
  max_power?: number;
  avg_vertical_oscillation?: number;
  avg_ground_contact_time?: number;
  avg_stride_length?: number;
  total_ascent?: number;
  total_descent?: number;
  start_position_lat?: number;
  start_position_long?: number;
  end_position_lat?: number;
  end_position_long?: number;
  time_in_hr_zone?: number[];
}

export interface FitData {
  activity?: FitActivity[];
  sessions?: FitSession[];
  laps?: FitLap[];
  records?: unknown[];
}
