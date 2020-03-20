"use strict";

class PrimeSieve {


	constructor(n) {

		if (n < 2) {
			this.max = 2;
		} else {
			this.max = n;
		}

		this.composite = Array(this.max).fill(false);

		var rootN = Math.floor(Math.sqrt(n));

		for (var i = 2; i < rootN; i++) {

			// if this is a prime number (not composite) then sieve the array
			if (!this.composite[i]) {
				var index = i + i;
				while (index <= this.max) {
					this.composite[index] = true;
					index = index + i;
				}
			}
		}

	}
	
	isPrime(n) {
		if (n <= 1 || n > this.max) {
			console.log("Prime check is outside of range: " + n);
		}

		return !this.composite[n];
	}
 	
}