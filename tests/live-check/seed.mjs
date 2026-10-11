// Two places on the device, and a made-up sign-in so the page opens past the welcome screen. The sign-in is not real:
// its tokens are nonsense that the account service refuses, so nobody is signed in and nothing is read or saved to an
// account. The app then runs from the two places held on the device.
export const SEED = `localStorage.setItem('vayu.pins.v1', JSON.stringify([
 {id:'28.59,77.05',name:'Home',detail:'Dwarka Sector 12, South West Delhi',lat:28.5921,lng:77.046},
 {id:'28.40,77.05',name:'School',detail:'DAV Public School, Sector 49, Gurgaon',lat:28.4095,lng:77.0526}]));
localStorage.setItem('vayu-auth.v1', JSON.stringify({email:'check@example.invalid',tokens:{idToken:'x',accessToken:'x',refreshToken:'x',expiresAt:Date.now()+3600000}}));`;
