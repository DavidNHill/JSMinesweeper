"use strict";

class BinomialCache {

	constructor(cacheSize, cacheFreshold, binomialEngine) {
		this.cacheSize = cacheSize;
		this.cacheFreshold = cacheFreshold;
		this.binomialEngine = binomialEngine;
		this.start = -1;
		this.useCount = 0;
		this.cacheRemoval = cacheSize / 2;
		this.cache = [];

		this.cacheHits = 0;
		this.cacheStores = 0;
		this.nearMiss = 0;
		this.fullCalc = 0;

		Object.seal(this); // prevent new values being created
	}

	getBinomial(k, n) {

		// if below the caching freshhold just go and get the binomial coefficient
		if (n <= this.cacheFreshold) {
			return this.binomialEngine.generate(k, n);
		}

		this.useCount++;

		let nearMissK = null;
		if (this.start != -1) {
			for (let i = this.start; i >= 0; i--) {
				const entry = this.cache[i];
				if (entry.k == k && entry.n == n) {
					this.cacheHits++;
					entry.lastUsed = this.useCount;
					return entry.bco;
				}
				if (entry.n == n && entry.k == k + 1) {
					nearMissK = entry;
				}
			}
		}

		let b;
		if (nearMissK != null) {
			b = nearMissK.bco * BigInt(nearMissK.k) / BigInt(nearMissK.n - nearMissK.k + 1);
			this.nearMiss++;
		} else {
			b = this.binomialEngine.generate(k, n);
			this.fullCalc++;
		}

		if (this.start == this.cacheSize - 1) {
			this.compressCache();
		}

		this.start++;
		const be = new BinomialEntry(k, n, b);
		be.lastUsed = this.useCount;

		this.cache.push(be);
		this.cacheStores++;

		return b;

	}

	compressCache() {

		console.log("Compressing the binomial cache");

		// sort into last used order 
		this.cache.sort(function (a, b) { return a.lastUsed - b.lastUsed});

		if (this.cache[0].lastUsed > this.cache[1].lastUsed) {
			console.log("Sort order wrong!");

		}
		for (let i = 0; i < this.cacheSize - this.cacheRemoval; i++) {
			this.cache[i] = this.cache[i + this.cacheRemoval];
		}

		this.start = this.start - this.cacheRemoval;
		this.cache.length = this.start + 1;
	}

	// the largest Binomial co-efficient computable in Choose k from N
	getMaxN() {
		return this.binomialEngine.max;
	}

	stats() {
		console.log("Binomial Cache ==> stores: " + this.cacheStores + ", Hits: " + this.cacheHits + ", near miss: " + this.nearMiss + ", full calc: " + this.fullCalc);
	}
}




class BinomialEntry {

	constructor(k, n, bco) {
		this.k = k;
		this.n = n;
		this.bco = BigInt(bco);
		this.lastUsed = 0;

		Object.seal(this); // prevent new values being created
	}
}




class Binomial {

	constructor(max, lookup) {

		const start = Date.now();

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

		console.log("Binomial coefficients look-up generated up to " + lookup + ", on demand up to " + max);
		console.log("Processing took " + (Date.now() - start) + " milliseconds");
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