const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Car = require('../models/Car');
const RentalCarProvider = require('../models/RentalCarProvider');
const User = require('../models/User');
const Booking = require('../models/Booking');

describe('Booking Routes', () => {
  let token, providerId, carId, bookingId, regUserToken, regUserId;    
  let reg2UserToken, reg2UserId, bookingfakeId;
  const createdIds = { users: [], providers: [], cars: [], bookings: [] };

  beforeAll(async () => {
    const mongoUri = 'mongodb://127.0.0.1:27017/auth_test_db';
    await mongoose.connect(mongoUri);
  });

  beforeEach(async () => {
    // Create provider user
    await User.deleteOne({ email: 'bt.provider@example.com' });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'BT - Provider User',
        telephoneNumber: '074571062',
        email: 'bt.provider@example.com',
        password: 'password123',
        role: 'provider',
      });

    token = res.body.token;
    const userId = res.body.data._id;
    createdIds.users.push(userId);

    // Create rental car provider
    const rcpRes = await request(app)
      .post('/api/v1/rentalcarproviders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'BT - Test Provider',
        address: '123 Main Street',
        district: 'Downtown',
        province: 'Bangkok',
        postalcode: '10110',
        tel: '074571062',
        region: 'Central',
        user: userId,
      });

    providerId = rcpRes.body.data._id;
    createdIds.providers.push(providerId);

    // Create a car
		await Car.deleteOne({ brand: 'Toyota', model: 'Mighty X' });
    const carRes = await request(app)
      .post(`/api/v1/cars/${providerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        brand: 'Toyota',
        model: 'Mighty X',
        type: 'Truck',
        topSpeed: 160,
        year: 1996,
        fuelType: 'Petrol',
        seatingCapacity: 5,
        pricePerDay: 1200,
        provider: providerId,
        carDescription: 'My father used to drive this car.',
      });

    carId = carRes.body.data._id;
    createdIds.cars.push(carId);

    // Create a regular user
		await User.deleteOne({ email: 'bt.reguser0660006666@example.com' });
    const userRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'BT - Regular User',
        telephoneNumber: '0660006666',
        email: 'bt.reguser0660006666@example.com',
        password: 'password123',
        role: 'user',
      });

    regUserToken = userRes.body.token;
    regUserId = userRes.body.data._id;


    //Create second regular user
    await User.deleteOne({ email: 'bt.reguser0770007777@example.com' });
    const user2Res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'BT - Regular User 2',
        telephoneNumber: '0660106666',
        email: 'bt.reguser0770007777@example.com',
        password: 'password123',
        role: 'user',
      });

    reg2UserToken = user2Res.body.token;
    reg2UserId = user2Res.body.data._id;
    createdIds.users.push(reg2UserId);

    // Create a booking
    const bookingRes = await request(app)
      .post(`/api/v1/cars/${carId}/bookings`)
      .set('Authorization', `Bearer ${regUserToken}`)
      .send({
        start_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
        end_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
      });

    bookingId = bookingRes.body.data._id;
    createdIds.bookings.push(bookingId);
  });

  afterEach(async () => {
    await Promise.all([
      ...createdIds.bookings.map((id) => Booking.findByIdAndDelete(id)),
      ...createdIds.cars.map((id) => Car.findByIdAndDelete(id)),
      ...createdIds.providers.map((id) => RentalCarProvider.findByIdAndDelete(id)),
      ...createdIds.users.map((id) => User.findByIdAndDelete(id)),
    ]);
    Object.keys(createdIds).forEach((key) => (createdIds[key] = []));
		jest.clearAllMocks();
		jest.restoreAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/v1/cars/:carId/bookings', () => {
    it('should create a booking', async () => {
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(),
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.car.toString()).toBe(carId.toString());
    });

		it('should not create a booking with invalid dates', async () => {
			const res = await request(app)
				.post(`/api/v1/cars/${carId}/bookings`)
				.set('Authorization', `Bearer ${regUserToken}`)
				.send({
					start_date: new Date(Date.now() + 86400000).toISOString(),
					end_date: new Date(Date.now()).toISOString(), // End date is before start date
				});

			expect(res.statusCode).toBe(400);
		});

    it('should not create a booking if the user has already made 3 bookings', async () => {
      // register a new user
      await User.deleteOne({ email: 'test3car@example.com' });
      const newUserRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test 3 Car User',
          telephoneNumber: '0644444444',
          email: 'test3car@example.com',
          password: 'password123',
          role: 'user',
        });
      const newUserToken = newUserRes.body.token;
      const newUserId = newUserRes.body.data._id;
      createdIds.users.push(newUserId);
      
      // Create 3 bookings for the user
      for (let i = 0; i < 3; i++) {
        const temp = await request(app)
          .post(`/api/v1/cars/${carId}/bookings`)
          .set('Authorization', `Bearer ${newUserToken}`)
          .send({
            start_date: new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
            end_date: new Date(Date.now() + 86400000 * (i + 2)).toISOString(),
          });
        createdIds.bookings.push(temp.body.data._id);
        console.log('Booking created:', temp.body.data._id);
      }

      // Attempt to create a 4th booking
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${newUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000 * 4).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 5).toISOString(),
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe(`The user with ID ${newUserId} has already made 3 bookings`);
    });

		it('should handle unexpected errors in catch block', async () => {
			jest.spyOn(require('../models/Car'), 'findById').mockImplementation(() => {
				throw new Error();
			});
	
			const res = await request(app)
				.post(`/api/v1/cars/${createdIds.cars[0]}/bookings`)
				.set('Authorization', `Bearer ${regUserToken}`)
				.send({
					start_date: new Date(Date.now() + 86400000).toISOString(),
					end_date: new Date(Date.now() + 86400000 * 3).toISOString(),
				});
	
			expect(res.status).toBe(500);
			expect(res.body.success).toBe(false);
			expect(res.body.message).toBe('Unexpected Error');
	
			require('../models/Car').findById.mockRestore();
		});

    it('should return 400 if startDate and endDate are not provided', async () => {
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          // No start_date and end_date provided
        });
      expect(res.statusCode).toBe(400);     
      expect(res.body.message).toBe("startDate and endDate are required");
    })

    it('should return 404 if carId is not found', async () => {
      const res = await request(app)
        .post('/api/v1/cars/123456789012345678901234/bookings')
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(),
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('No rental car provider with the id of 123456789012345678901234');
    } );

    it('should return 400 if the user makes a booking in the past', async () => {
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() - 86400000).toISOString(), // Start date is in the past
          end_date: new Date(Date.now()).toISOString(), // End date is also in the past
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Can't Make Reservation in Past");
    });


    it('should return 403 if the provider tries to add booking for other providers beside their own', async () => {
      // Create a new provider user who does not own the car
      await User.deleteOne({ email: 'unauthorized.provider673305@example.com' });
      const newProviderRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unauthorized Provider for 403',
          telephoneNumber: '000000111111',
          email: 'unauthorized.provider673305@example.com',
          password: 'password123',
          role: 'provider',
        });
    
      const unauthorizedProviderToken = newProviderRes.body.token;
    
      // Attempt to add a booking for the car with the unauthorized provider's token
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${unauthorizedProviderToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
        });
    
      // Assertions
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You are not authorized to add booking for other providers beside your own');
    });


  });

  describe('GET /api/v1/bookings', () => {    
    it('should get all bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${regUserToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should allow admin to retrieve all bookings', async () => {
      // Create an admin user
      await User.deleteOne({ email: 'bt.admin.123@example.com' });
      const adminRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'BT - Just for this case Admin User',
          telephoneNumber: '0800008080',
          email: 'bt.admin.123@example.com',
          password: 'password123',
          role: 'admin',
        });
      const adminToken = adminRes.body.token;
      createdIds.users.push(adminRes.body.token._id);
  
      const res = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`);
  
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });



    it('should handle unexpected errors in catch block (GET bookings for a specific car)', async () => {
      const BookingModel = require('../models/Booking');
    
      // Properly mock find to return an object where populate() throws when awaited
      jest.spyOn(BookingModel, 'find').mockReturnValue({
        populate: () => Promise.reject(new Error('Unexpected Error'))
      });
    
      const res = await request(app)
        .get(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`);
    
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unexpected Error');
    
      BookingModel.find.mockRestore();
    });
    

    it('should return 403 if the provider tries to retrieve bookings for a car they do not own', async () => {
      // Create another provider
      await User.deleteOne({ email: 'another.provider-CP22@example.com' });
      const anotherProviderRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Another Provider-CP22',
          email: 'another.provider-CP22@example.com',
          telephoneNumber: '0000000070007',
          password: 'password123',
          role: 'provider',
        });
        
      const anotherProviderToken = anotherProviderRes.body.token;
      const anotherProviderId = anotherProviderRes.body.data._id;
      createdIds.users.push(anotherProviderId);
        
      // Create a rental car provider for the new provider user
      const anotherRcpRes = await request(app)
        .post('/api/v1/rentalcarproviders')
        .set('Authorization', `Bearer ${anotherProviderToken}`)
        .send({
          name: 'Another Test Provider',
          address: '789 Another Street',
          district: 'Uptown',
          province: 'Chiang Mai',
          postalcode: '50200',
          tel: '0999999999',
          region: 'North',
          user: anotherProviderId,
        });
        
      const anotherRcpId = anotherRcpRes.body.data._id;
      createdIds.providers.push(anotherRcpId);
        
      // Attempt to retrieve bookings for a car owned by a different provider
      const res = await request(app)
        .get(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${anotherProviderToken}`);
      
      // Assertions
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You are not authorized to get booking form other providers beside your own');
    });    
  });
  
  describe('GET /api/v1/bookings/:bookingId', () => {
    it('should get a booking by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('_id', bookingId.toString());
    });

    it('should return 404 for non-existing booking', async () => {
      const res = await request(app)
        .get('/api/v1/bookings/123456789012345678901234')
        .set('Authorization', `Bearer ${regUserToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('No booking found with id of 123456789012345678901234');
    });

		it('should handle unexpected errors in catch block (GET by ID)', async () => {
      jest.spyOn(require('../models/Booking'), 'findById').mockImplementation(() => {
        throw new Error();
      });

      const res = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unexpected Error');

      require('../models/Booking').findById.mockRestore();
    });
  });

  describe('PUT /api/v1/bookings/:bookingId', () => {
    let newStartDate = new Date(Date.now() + 86400000 * 2).toISOString(); 
    let newEndDate = new Date(Date.now() + 86400000 * 4).toISOString();

    let promo_Id;
  
    beforeEach(async () => {
      // Create a promotion
      const promoRes = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${token}`) // Provider token
        .send({
          title: '10% Off',
          description: 'Get 10% off your booking!',
          discountPercentage: 10,
          maxDiscountAmount: 500,
          minPurchaseAmount: 1000,
          startDate: new Date(Date.now() - 86400000).toISOString(), // Started yesterday
          endDate: new Date(Date.now() + 86400000 * 7).toISOString(), // Ends in 7 days
          provider: providerId,
          amount: 5,
        });
  
      promo_Id = promoRes.body.data._id;
    });

    it('should update a booking', async () => {
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate, 
          end_date: newEndDate, 
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('_id', bookingId.toString());
      expect(res.body.data.start_date).toBe(newStartDate);
      expect(res.body.data.end_date).toBe(newEndDate);
    });

    it('should update a booking with promotion', async () => {
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate, 
          end_date: newEndDate, 
          promoId: promo_Id,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('_id', bookingId.toString());
      expect(res.body.data.start_date).toBe(newStartDate);
      expect(res.body.data.end_date).toBe(newEndDate);
    });

    it('should update a booking status', async () => {
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate, 
          end_date: newEndDate, 
          statusUpdateOnly: 'completed',
          status: 'completed',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('_id', bookingId.toString());
      expect(res.body.data.status).toBe('completed');
    });


    it('should return 400 if the promotion provider does not match the car provider', async () => {
      await User.deleteOne({ email: 'unique.provider@example.com' });
      const otherProviderRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unique Provider',
          telephoneNumber: '0999999999',
          email: 'unique.provider@example.com',
          password: 'password123',
          role: 'provider',
        });
    
      const otherProviderToken = otherProviderRes.body.token;
      const otherProviderUserId = otherProviderRes.body.data._id;
      createdIds.users.push(otherProviderUserId);
    
      // Create a rental car provider for the new provider user
      const otherRcpRes = await request(app)
        .post('/api/v1/rentalcarproviders')
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({
          name: 'Unique Test Provider',
          address: '456 Another Street',
          district: 'Uptown',
          province: 'Chiang Mai',
          postalcode: '50200',
          tel: '0999999999',
          region: 'North',
          user: otherProviderUserId,
        });
    
      const otherProviderId = otherRcpRes.body.data._id;
      createdIds.providers.push(otherProviderId);
    
      // Create a promotion for the new provider
      const otherPromoRes = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({
          title: '20% Off',
          description: 'Get 20% off!',
          discountPercentage: 20,
          maxDiscountAmount: 1000,
          minPurchaseAmount: 1000,
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date(Date.now() + 86400000 * 7).toISOString(),
          provider: otherProviderId,
          amount: 5,
        });
    
      const otherPromoId = otherPromoRes.body.data._id;
      
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate, 
          end_date: newEndDate, 
          promoId: otherPromoId,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Promotion provider does not match car provider');
    });

    it('should not update a booking with invalid dates', async () => {
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate,
          end_date: new Date(Date.now()).toISOString(),
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Start date must be before end date.');
    });

		it('should handle unexpected errors in catch block (PUT)', async () => {
      jest.spyOn(require('../models/Booking'), 'findById').mockImplementation(() => {
        throw new Error();
      });

      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000 * 2).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 4).toISOString(),
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unexpected Error');

      require('../models/Booking').findById.mockRestore();
    });

    it('should return 400 if startDate is before current date', async () => {   
         const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() - 86400000).toISOString(), // Start date is in the past
          end_date: newEndDate,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Can't Make Reservation in Past");
    });

    it('should return 404 if bookingId is not found', async () => {
      const res = await request(app)
        .put('/api/v1/bookings/123456789012345678901234')
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate,
          end_date: newEndDate,
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('No booking with the id of 123456789012345678901234');
    });

    it('should return 401 if the user is not authorized to update the booking that is not their booking', async () => {
      // Create a new user who does not own the booking
      await User.deleteOne({ email: 'unauthorized.user@example.com' });
      const newUserRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unauthorized User',
          telephoneNumber: '0000800000',
          email: 'unauthorized.user@example.com',
          password: 'password123',
          role: 'user',
        });

      const unauthorizedUserToken = newUserRes.body.token;

      // Attempt to update the booking with the unauthorized user's token
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${unauthorizedUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000 * 2).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 4).toISOString(),
        });

      // Assertions
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe(`User ${newUserRes.body.data._id} is not authorized to update this booking`);
    });

    it('should return 403 if the provider tries to update booking for other providers beside their own', async () => {
      // Create a new provider user who does not own the car
      await User.deleteOne({ email: 'unauthorized.provider673305@example.com' });
      const newProviderRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unauthorized Provider for 403',
          telephoneNumber: '000000111111',
          email: 'unauthorized.provider673305@example.com',
          password: 'password123',
          role: 'provider',
        });
    
      const unauthorizedProviderToken = newProviderRes.body.token;
    
      // Create a booking by a regular user for the car
      const bookingRes = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${reg2UserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
        });
    
      const bookingId = bookingRes.body.data._id;
    
      // Attempt to update the booking with the unauthorized provider's token
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${unauthorizedProviderToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000 * 2).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 4).toISOString(),
        });
    
      // Assertions
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You are not authorized to update booking for other providers beside your own');
    });


    it('should return 404 if CarId is not found', async () => {
      // Mock Car.findById to return null
      jest.spyOn(require('../models/Car'), 'findById').mockResolvedValue(null);
    
      const res = await request(app)
        .put(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: newStartDate,
          end_date: newEndDate,
        });
    
      // Assertions
      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('Car not found');
    
      // Restore the mock
      require('../models/Car').findById.mockRestore();
    });
  });

  describe('DELETE /api/v1/bookings/:bookingId', () => {
    
    it('should delete a booking', async () => {
      console.log('Booking ID:', bookingId);
      const res = await request(app)
        .delete(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${regUserToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should return 401 if the user is not authorized to delete the booking', async () => {
      await User.deleteOne({ email: 'unauthorized.user@example.com' });
      const newUserRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unauthorized User',
          telephoneNumber: '0000800000',
          email: 'unauthorized.user@example.com',
          password: 'password123',
          role: 'user',
        });
    
      const unauthorizedUserToken = newUserRes.body.token;
    
      const res = await request(app)
        .delete(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${unauthorizedUserToken}`);
    
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe(`User ${newUserRes.body.data._id} is not authorized to delete this booking`);
    });

    it('should return 404 for non-existing booking', async () => {
      const res = await request(app)
        .delete('/api/v1/bookings/123456789012345678901234')
        .set('Authorization', `Bearer ${regUserToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('No booking with the id of 123456789012345678901234');
    });

		it('should handle unexpected errors in catch block (DELETE)', async () => {
			// Mock Booking.findById to throw an error
			const mockFindById = jest.spyOn(require('../models/Booking'), 'findById').mockImplementation(() => {
				throw new Error();
			});
	
			const res = await request(app)
				.delete(`/api/v1/bookings/${bookingId}`)
				.set('Authorization', `Bearer ${regUserToken}`);
	
			expect(res.status).toBe(500);
			expect(res.body.success).toBe(false);
			expect(res.body.message).toBe('Unexpected Error');
	
			// Restore the mock
			mockFindById.mockRestore();
		});

    it('should return 403 if the provider is not authorized to delete the booking', async () => {
      // Create a new provider user who does not own the car
      await User.deleteOne({ email: 'unauthorized.provider@example.com' });
      const newProviderRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unauthorized Provider',
          telephoneNumber: '090909090909',
          email: 'unauthorized.provider@example.com',
          password: 'password123',
          role: 'provider',
        });
    
      const unauthorizedProviderToken = newProviderRes.body.token;
    
      // Attempt to delete the booking with the unauthorized provider's token
      const res = await request(app)
        .delete(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${unauthorizedProviderToken}`);
    
      // Assertions
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You are not authorized to delete booking for other providers beside your own');
    });
  });

  describe('POST /api/v1/cars/:carId/bookings with promotions', () => {
    let promoId;
  
    beforeEach(async () => {
      // Create a promotion
      const promoRes = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${token}`) // Provider token
        .send({
          title: '10% Off',
          description: 'Get 10% off your booking!',
          discountPercentage: 10,
          maxDiscountAmount: 500,
          minPurchaseAmount: 1000,
          startDate: new Date(Date.now() - 86400000).toISOString(), // Started yesterday
          endDate: new Date(Date.now() + 86400000 * 7).toISOString(), // Ends in 7 days
          provider: providerId,
          amount: 5,
        });
  
      promoId = promoRes.body.data._id;
    });

    it('should apply a valid promotion successfully', async () => {
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
          promoId,
        });
  
      expect(res.statusCode).toBe(201);
      expect(res.body.data.totalprice).toBeLessThan(3600); // Base price = 1200 * 3 = 3600
      expect(res.body.data.totalprice).toBeGreaterThan(0);
    });

    it('should return 500 if the promotion does not exist', async () => {
      const invalidPromoId = '123456789012345678901234'; // Non-existent promoId
  
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
          promoId: invalidPromoId,
        });
  
      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unexpected Error');
    });

    it('should return 500 if the promotion provider does not match the car provider', async () => {
      // Create a new provider user
      await User.deleteOne({ email: 'unique.provider@example.com' });
      const otherProviderRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Unique Provider',
          telephoneNumber: '0999999999',
          email: 'unique.provider@example.com',
          password: 'password123',
          role: 'provider',
        });
    
      const otherProviderToken = otherProviderRes.body.token;
      const otherProviderUserId = otherProviderRes.body.data._id;
      createdIds.users.push(otherProviderUserId);
    
      // Create a rental car provider for the new provider user
      const otherRcpRes = await request(app)
        .post('/api/v1/rentalcarproviders')
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({
          name: 'Unique Test Provider',
          address: '456 Another Street',
          district: 'Uptown',
          province: 'Chiang Mai',
          postalcode: '50200',
          tel: '0999999999',
          region: 'North',
          user: otherProviderUserId,
        });
    
      const otherProviderId = otherRcpRes.body.data._id;
      createdIds.providers.push(otherProviderId);
    
      // Create a promotion for the new provider
      const otherPromoRes = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${otherProviderToken}`)
        .send({
          title: '20% Off',
          description: 'Get 20% off!',
          discountPercentage: 20,
          maxDiscountAmount: 1000,
          minPurchaseAmount: 1000,
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date(Date.now() + 86400000 * 7).toISOString(),
          provider: otherProviderId,
          amount: 5,
        });
    
      const otherPromoId = otherPromoRes.body.data._id;
    
      // Attempt to use the promotion with a car from a different provider
      const res = await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${regUserToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(),
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(),
          promoId: otherPromoId,
        });
    
      // Assertions
      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unexpected Error');
    });
  });

  describe('GET /api/v1/cars/:carId/bookings', () => {
    let carId;
    let providerToken;
    let adminToken;
    let userToken;
    const createdIds = { users: [], providers: [], cars: [], bookings: [] };
  
    beforeAll(async () => {
     
      const mongoUri = 'mongodb://127.0.0.1:27017/auth_test_db';
      await mongoose.connect(mongoUri);});
    
    beforeEach(async () => {
      // Create provider user
      await User.deleteOne({ email: 'provider-CP@example.com' });
      const providerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Provider User Cross path',
          email: 'provider-CP@example.com',
          telephoneNumber: '0000000070001',
          password: 'password123',
          role: 'provider',
        });
      providerToken = providerRes.body.token;
      const providerId = providerRes.body.data._id;
			console.log("PROVIDER :",providerId)
      createdIds.providers.push(providerId);
      // Create an admin
      await User.deleteOne({ email: 'admin-CP@example.com' });
      const adminRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Admin User Cross path',
          email: 'admin-CP@example.com',
          telephoneNumber: '0000000070002',
          password: 'password123',
          role: 'admin',
        });
      adminToken = adminRes.body.token;
      const adminId = adminRes.body.data._id;
      createdIds.users.push(adminId);
  
      // Create a regular user
      await User.deleteOne({ email: 'userCPP@example.com' });
      const userRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Regular User Cross pathh',
          email: 'userCPP@example.com',
          telephoneNumber: '000070003',
          password: 'password123',
          role: 'user',
        });
      userToken = userRes.body.token;
      const userId = userRes.body.data._id;
      createdIds.users.push(userId);

			// Create rental car provider
			const rcpRes = await request(app)
      .post('/api/v1/rentalcarproviders')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        name: 'CPP - Test Provider',
        address: '123 Main Street',
        district: 'Downtown',
        province: 'Bangkok',
        postalcode: '10110',
        tel: '074571062',
        region: 'Central',
        user: providerId,
      });
			const rcpId = rcpRes.body.data._id;
			createdIds.providers.push(rcpRes.body.data._id);
			
      // Create a car owned by the provider
      const carRes = await request(app)
        .post(`/api/v1/cars/${rcpId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          brand: 'Toyota',
          model: 'SQQQCET',
          type: 'Sedan',
          pricePerDay: 100,
          seatingCapacity: 5,
          fuelType: 'Petrol',
          year: 2022,
          topSpeed: 200,
					provider: rcpId,
        });
      carId = carRes.body.data._id;
			createdIds.cars.push(carId);
  
      // Create a booking for the car by the user
      const bookingRes= await request(app)
        .post(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          start_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
          end_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
        });
			const bookingId = bookingRes.body.data._id;
			createdIds.bookings.push(bookingId);
	
			

    });
		afterEach(async () => {
				await Promise.all([
					...createdIds.bookings.map((id) => Booking.findByIdAndDelete(id)),
					...createdIds.cars.map((id) => Car.findByIdAndDelete(id)),
					...createdIds.providers.map((id) => RentalCarProvider.findByIdAndDelete(id)),
					...createdIds.users.map((id) => User.findByIdAndDelete(id)),
				]);
				Object.keys(createdIds).forEach((key) => (createdIds[key] = []));
				jest.clearAllMocks();
				jest.restoreAllMocks();
		});
		afterAll(async () => {
				await mongoose.connection.close();
		});

		
    it('should allow admin to retrieve bookings for a specific car', async () => {
      const res = await request(app)
        .get(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${adminToken}`);
  
      // Assertions
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  
    it('should allow provider to retrieve bookings for their own car', async () => {
      const res = await request(app)
        .get(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${providerToken}`);
  
      // Assertions
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  
    it('should allow user to retrieve their own bookings for a specific car', async () => {
      const res = await request(app)
        .get(`/api/v1/cars/${carId}/bookings`)
        .set('Authorization', `Bearer ${userToken}`);
  
      // Assertions
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});

