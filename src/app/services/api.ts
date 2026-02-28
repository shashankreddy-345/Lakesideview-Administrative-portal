// src/app/services/api.ts
import { supabase } from "./supabase";

// Helper to map Supabase ID to _id for frontend compatibility
const mapDoc = <T>(doc: any): T => {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(mapDoc) as any;
  return {
    ...doc,
    _id: doc.booking_id || doc.feedback_id || doc.waitlist_id || doc.resource_id || doc.user_id || doc.id || doc._id, // Prioritize specific PKs
    user_id: doc.user_id || (doc.role ? doc.id : undefined) // Ensure user_id is preserved or mapped from id for users
  };
}

// Helper to fetch all rows with pagination
const fetchAll = async (
  tableName: string,
  options: {
    select?: string;
    order?: { column: string; ascending?: boolean } | { column: string; ascending?: boolean }[];
    filter?: (query: any) => any;
  } = {}
) => {
  let allData: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let done = false;

  while (!done) {
    let query = supabase.from(tableName).select(options.select || '*');

    if (options.order) {
      const orders = Array.isArray(options.order) ? options.order : [options.order];
      orders.forEach(o => {
        query = query.order(o.column, { ascending: o.ascending });
      });
    }

    if (options.filter) {
      query = options.filter(query);
    }

    const { data, error } = await query.range(from, from + batchSize - 1);
    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < batchSize) done = true;
      else from += batchSize;
    } else {
      done = true;
    }
  }
  return allData;
};

// Data Models
export interface User {
  _id: string;
  user_id?: string;
  email: string;
  full_name?: string;
  password?: string;
  role: 'student' | 'admin';
  createdAt?: string;
  updatedAt?: string;
}

export interface Resource {
  _id: string;
  resource_id?: string;
  name: string;
  type: string;
  capacity: number;
  building: string;
  floor?: number;
  floorNumber?: number;
  amenities?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Booking {
  _id: string;
  resourceId: string;
  studentId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Feedback {
  _id: string;
  rating: number;
  comment: string;
  user_id?: string;
  booking_id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// API Methods
export const api = {
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) {
        console.error("Supabase Login Error:", error);
        throw error;
      }
      
      // Fetch user details from 'users' table to get role
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', credentials.email)
        .single();
        
      if (userError) throw userError;

      return {
        token: data.session.access_token,
        user: mapDoc<User>(userData)
      };
    },
    register: async (userData: Omit<User, '_id' | 'role'> & { password: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      });
      if (error) throw error;
      
      // Create user record in 'users' table
      const { data: newUser, error: dbError } = await supabase
        .from('users')
        .insert([{ ...userData, role: 'student', id: data.user?.id }]) // Assuming default role
        .select()
        .single();
        
      if (dbError) throw dbError;

      return {
        token: data.session?.access_token || '',
        user: mapDoc<User>(newUser)
      };
    },
  },
  
  users: {
    list: async () => {
      const data = await fetchAll('users');
      return mapDoc<User[]>(data);
    },
    get: async (id: string) => {
      const { data, error } = await supabase.from('users').select('*').eq('user_id', id).single();
      if (error) throw error;
      return mapDoc<User>(data);
    }
  },

  resources: {
    list: async () => {
      const data = await fetchAll('resources');
      return mapDoc<Resource[]>(data);
    },
    get: async (id: string) => {
      const { data, error } = await supabase.from('resources').select('*').eq('resource_id', id).single();
      if (error) throw error;
      return mapDoc<Resource>(data);
    },
    create: async (data: Omit<Resource, '_id'>) => {
      // Remove _id if present in input to let DB handle it, or map it if you want to force it
      const { _id, ...rest } = data as any;
      const { data: newResource, error } = await supabase.from('resources').insert([{ ...rest, resource_id: `ROOM-${Math.floor(1000 + Math.random() * 9000)}` }]).select().single();
      if (error) throw error;
      return mapDoc<Resource>(newResource);
    },
    update: async (id: string, data: Partial<Resource>) => {
      const { data: updated, error } = await supabase.from('resources').update(data).eq('resource_id', id).select().single();
      if (error) throw error;
      return mapDoc<Resource>(updated);
    },
    delete: async (id: string) => {
      const { error } = await supabase.from('resources').delete().eq('resource_id', id);
      if (error) throw error;
    },
  },

  bookings: {
    list: async (range?: { start: string; end: string }) => {
      const data = await fetchAll('bookings', {
        order: [
          { column: 'start_time', ascending: false },
          { column: 'booking_id', ascending: false }
        ],
        filter: (q) => {
          if (range) {
            return q.gt('end_time', range.start).lt('start_time', range.end);
          }
          return q;
        }
      });
      return mapDoc<Booking[]>(data);
    },
    get: async (id: string) => {
      const { data, error } = await supabase.from('bookings').select('*').eq('booking_id', id).single();
      if (error) throw error;
      return mapDoc<Booking>(data);
    },
    getByStudent: async (studentId: string) => {
      const data = await fetchAll('bookings', {
        filter: (q) => q.eq('user_id', studentId)
      });
      return mapDoc<Booking[]>(data);
    },
    create: async (data: Omit<Booking, '_id'>) => {
      const { _id, ...rest } = data as any;
      const { data: newBooking, error } = await supabase.from('bookings').insert([{ ...rest, booking_id: `BKG-${Math.floor(1000 + Math.random() * 9000)}` }]).select().single();
      if (error) throw error;
      return mapDoc<Booking>(newBooking);
    },
    update: async (id: string, data: Partial<Booking>) => {
      const { data: updated, error } = await supabase.from('bookings').update(data).eq('booking_id', id).select().single();
      if (error) throw error;
      return mapDoc<Booking>(updated);
    },
    cancel: async (id: string) => {
      // Assuming cancel means delete, or update status to cancelled
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('booking_id', id);
      if (error) throw error;
    },
  },

  feedback: {
    list: async () => {
      const data = await fetchAll('feedbacks');
      return mapDoc<Feedback[]>(data);
    },
    create: async (data: Omit<Feedback, '_id'>) => {
      // Map frontend fields to DB schema
      const payload = {
        rating: data.rating,
        comment: data.comment,
        user_id: data.user_id, // Ensure this matches the schema column
        booking_id: data.booking_id,
        feedback_id: `FDB-${Math.floor(1000 + Math.random() * 9000)}`
      };
      const { data: newFeedback, error } = await supabase.from('feedbacks').insert([payload]).select().single();
      if (error) throw error;
      return mapDoc<Feedback>(newFeedback);
    },
  },

  waitlist: {
    join: async (data: { resourceId: string; studentId: string }) => {
      const { data: entry, error } = await supabase.from('waitlists').insert([{ ...data, waitlist_id: `WTL-${Math.floor(1000 + Math.random() * 9000)}` }]).select().single();
      if (error) throw error;
      return entry;
    },
    list: async () => {
      const data = await fetchAll('waitlists');
      return data;
    },
  }
};

export default api;
