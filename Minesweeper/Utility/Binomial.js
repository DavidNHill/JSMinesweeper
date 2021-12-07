"use strict";

class Binomial {

	constructor(max, lookup) {

		this.max = max;

		this.ps = new PrimeSieve(this.max);

		if (lookup < 10) {
			lookup = 10;
		}
		this.lookupLimit = lookup;

		const lookup2 = lookup / 2;

		this.binomialLookup = Array(lookup + 1);

		for (let total = 1; total <= lookup; total++) {

			this.binomialLookup[total] = Array(lookup2 + 1);

			for (let choose = 0; choose <= total / 2; choose++) {
				this.binomialLookup[total][choose] = this.generate(choose, total);
			}


		}

	}


	generate(k, n) {

		if (n == 0 && k == 0) {
			return BigInt(1);
		}

		if (n < 1 || n > this.max) {
			throw new Error("Binomial: 1 <= n and n <= max required, but n was " + n + " and max was " + this.max);
		}

		if (0 > k || k > n) {
			console.log("Binomial: 0 <= k and k <= n required, but n was " + n + " and k was " + k);
			throw new Error("Binomial: 0 <= k and k <= n required, but n was " + n + " and k was " + k);
		}

		var choose = Math.min(k, n - k);

		var answer;
		if (n <= this.lookupLimit) {
			answer = this.binomialLookup[n][choose];
		}

		if (answer != null) {
			return answer;
		} else if (choose < 25) {
			return this.combination(choose, n);
		} else {
			return this.combinationLarge(choose, n);
		}

	}
	
    combination(mines, squares) {

		let top = BigInt(1);
		let bot = BigInt(1);

		const range = Math.min(mines, squares - mines);

		// calculate the combination. 
		for (let i = 0; i < range; i++) {
			top = top * BigInt(squares - i);
			bot = bot* BigInt(i + 1);
		}

		const result = top / bot;

		return result;

	}    
	
	
	combinationLarge(k, n) {

		if ((k == 0) || (k == n)) return BigInt(1);

		const n2 = n / 2;

		if (k > n2) {
			k = n - k;
		}

		const nk = n - k;

		const rootN = Math.floor(Math.sqrt(n));

		let result = BigInt(1);

		for (let prime = 2; prime <= n; prime++) {

			// we only want the primes
			if (!this.ps.isPrime(prime)) {
				continue;
            }

			if (prime > nk) {
				result = result * BigInt(prime);
				continue;
			}

			if (prime > n2) {
				continue;
			}

			if (prime > rootN) {
				if (n % prime < k % prime) {
					result = result * BigInt(prime);
				}
				continue;
			}

			let r = 0;
			let N = n;
			let K = k;
			let p = 1;

			let safety = 100;
			while (N > 0) {
				r = (N % prime) < (K % prime + r) ? 1 : 0;
				if (r == 1) {
					p *= prime;
				}
				N = Math.floor( N / prime);
				K = Math.floor( K / prime);
				//console.log("r=" + r + " N=" + N + " k=" + k + " p=" + p);
				safety--;
				if (safety < 1) {
					console.log("Safety stop!!!");
					break;
                }
			}
			if (p > 1) {
				result = result * BigInt(p);
			}
		}

		return result;
	}

}