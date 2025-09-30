class Solution {
    public int coinChange(int[] coins, int amount) {
        int[][] dp = new int[coins.length+1][amount+1];
         for (int i = 0; i <= coins.length; i++) {
            for (int j = 0; j <= amount; j++) {
                if (j == 0) {
                    dp[i][j] = 0; 
                } else {
                    dp[i][j] = amount + 1; 
                }
            }
        }
        for(int i = 1;i<=coins.length;i++){
            for(int j = 1;j<=amount;j++){
                if(coins[i-1]<=j){
                    dp[i][j] = Math.min(dp[i][j-coins[i-1]]+1, dp[i-1][j]);
                }
                else{
                    dp[i][j] = dp[i-1][j];
                }
            }  
        }
        return dp[coins.length][amount] > amount ? -1 : dp[coins.length][amount];
    }
}
public class Main {
public static void main(String[] args) {
System.out.println(solve([1], 0));
}
}