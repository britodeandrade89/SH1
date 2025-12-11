export interface WeatherData {
  temperature: number | string;
  weathercode: number;
  is_day: number;
  apparent_temperature: number | string;
  precipitation_probability: number;
  // Novos campos
  relative_humidity: number | string;
  wind_speed: number | string;
  temp_max: number | string;
  temp_min: number | string;
  daily_precip_probability: number | string;
}

export interface Reminder {
  id: string;
  text: string;
  type: 'info' | 'alert' | 'action';
  time: string;
  createdAt?: any;
}

export interface NewsItem {
  text: string;
  time: string;
  img: string;
}

export interface NewsData {
  politica: NewsItem[];
  esportes: NewsItem[];
  cultura: NewsItem[];
}

// Augment window for SpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}